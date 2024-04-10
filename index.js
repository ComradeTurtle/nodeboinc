const { XMLValidator, XMLParser } = require('fast-xml-parser');
const { stateLookup, formatBytes } = require('./utils');
const { EventEmitter } = require('events');
const net = require('net');
const fs = require('fs');

class RPC extends EventEmitter {

    constructor(connectInfo = {hostname, port, password, debug}) {
        super();

        this.hostname = connectInfo.hostname || '127.0.0.1';
        this.port = connectInfo.port || 31416;
        this.debug = connectInfo.debug || false;
        
        this.socket = new net.Socket();
        this.socket.connect(this.port, this.hostname);

        this.connected = false;
        this.authenticated = false;
        if (!connectInfo.password) throw new Error('No password provided');

        if (this.debug) {
            console.debug(`Authenticating with ${this.hostname}...`);

            // open new file
            this.stream = fs.createWriteStream('debug.log', {flags: 'w'});
        }

        this.rawRequest('<auth1/>').then(async (a1) => {
            if (this.debug) console.debug(`Received nonce: ${a1.boinc_gui_rpc_reply.nonce}`);
            this.connected = true;
            this.rawRequest(`<auth2><nonce_hash>${require('crypto').createHash('md5').update(`${a1.boinc_gui_rpc_reply.nonce}${connectInfo.password}`).digest('hex')}</nonce_hash></auth2>`).then(async (a2) => {
                if (Object.hasOwn(a2.boinc_gui_rpc_reply, 'authorized')) {
                    if (this.debug) console.debug('Successfully authenticated');
                    this.authenticated = true;
                    // Get initial state
                    await this.getState();
                    if (this.debug) console.debug(`Fetched initial state from client.`);
                    this.emit('ready');
                } else {
                    throw new Error('Authentication failure');
                }
            })
        })
    }

    rawRequest(request) {
        const body = '<boinc_gui_rpc_request>' + request + '</boinc_gui_rpc_request>' + '\x03';
        return new Promise((resolve, reject) => {
            //! I don't like this at all
            while (this.mutex) {

            }
            this.mutex = true;
            this.socket.write(body);
            if (this.debug) this.stream.write(`[REQUEST] ${body}\n`);

            let response = '';
            this.socket.on('data', (data) => {
                response += data.toString();

                // Both requests and replies are terminated with the control character 0x03. 
                if (response.endsWith('\x03')) {
                    if (data) {
                        this.mutex = false;
                        if (this.debug) this.stream.write(`[RESPONSE] ${response}\n\n`);
                        const parser1 = new XMLParser();
                        // if (this.debug) console.debug(response);

                        this.socket.removeAllListeners('data');
                        if (XMLValidator.validate(response)) {
                            const parsed1 = parser1.parse(response);
                            resolve(parsed1);
                        } else {
                            reject('Invalid XML');
                            // this.socket.close();
                        }
                    }
                }
            });
        });
    }

    getState() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_state/>').then((state) => {
                this.state = state.boinc_gui_rpc_reply.client_state;
                resolve(this.state);
            }).catch((err) => reject(err));
        })
    }

    getWU(activeOnly = false) {
        return new Promise((resolve, reject) => {
            let req = activeOnly ? '<get_results/>' : '<get_results><active_only>0</active_only></get_results>';
            this.rawRequest(req).then((wu) => {
                if (!wu.boinc_gui_rpc_reply.results.result) {
                    this.wu = [];
                    resolve([]);
                    return;
                }
                wu.boinc_gui_rpc_reply.results.result.forEach((t) => {
                    if (t.active_task) {
                        t.active_task.scheduler_state_friendly = stateLookup('scheduler_state', t.active_task.scheduler_state);
                        t.active_task.active_task_state_friendly = stateLookup('task_state', t.active_task.active_task_state);
                    }

                    t.state_friendly = stateLookup('state', t.state);
                    for (let i = 0; i < this.state.app.length; i++) {
                        let app = this.state.app[i];
                        if (t.wu_name.includes(app.name)) {
                            t.nameFriendly = app.user_friendly_name;
                            t.nci = app.non_cpu_intensive;
                            break;
                        }
                    }

                    for (let i = 0; i < this.state.project.length; i++) {
                        let project = this.state.project[i];
                        if (t.project_url.includes(project.master_url)) {
                            t.projectName = project.project_name;
                            break;
                        }
                    }
                })
                this.wu = wu.boinc_gui_rpc_reply.results.result;
                resolve(this.wu);
            }).catch((err) => reject(err));
        })
    }

    setWU(action, project, name) {
        return new Promise((resolve, reject) => {
            let req;
            switch(action) {
                case 'abort':
                    req = `<abort_result><project_url>${project}</project_url><name>${name}</name></abort_result>`;
                    break;
                case 'suspend':
                    req = `<suspend_result><project_url>${project}</project_url><name>${name}</name></suspend_result>`;
                    break;
                case 'resume':
                    req = `<resume_result><project_url>${project}</project_url><name>${name}</name></resume_result>`;
                    break;
                default:
                    reject('Invalid action. Valid actions: abort, suspend, resume');
            }

            this.rawRequest(req).then((res) => {
                resolve(Object.hasOwn(res.boinc_gui_rpc_reply, 'success'));
            }).catch(reject);
        })
    }

    getMode() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_cc_status/>').then((stat) => {
                let st = stat.boinc_gui_rpc_reply.cc_status;
                let status = {
                    network_status: parseInt(st.network_mode),
                    network_status_friendly: stateLookup('network_status', st.network_mode),
                    network_status_selected: parseInt(st.network_mode_perm),
                    isTaskSuspended: parseInt(st.task_suspend_reason) !== 0,
                    isNetworkSuspended: parseInt(st.network_suspend_reason) !== 0,
                    isGpuSuspended: parseInt(st.gpu_suspend_reason) !== 0,
                    computeModes: {
                        task: parseInt(st.task_mode),
                        taskFriendly: stateLookup('run_mode', parseInt(st.task_mode)),
                        taskSelected: parseInt(st.task_mode_perm),
                        taskSelectedFriendly: stateLookup('run_mode', parseInt(st.task_mode_perm)),
                        gpu: parseInt(st.gpu_mode),
                        gpuFriendly: stateLookup('run_mode', parseInt(st.gpu_mode)),
                        gpuSelected: parseInt(st.gpu_mode_perm),
                        gpuSelectedFriendly: stateLookup('run_mode', parseInt(st.gpu_mode_perm)),
                        network: parseInt(st.network_mode),
                        networkFriendly: stateLookup('run_mode', parseInt(st.network_mode)),
                        networkSelected: parseInt(st.network_mode_perm),
                        networkSelectedFriendly: stateLookup('run_mode', parseInt(st.network_mode_perm)),
                        taskDelay: parseFloat(st.task_mode_delay),
                        gpuDelay: parseFloat(st.gpu_mode_delay),
                        networkDelay: parseFloat(st.network_mode_delay)
                    }
                }

                if (status.isTaskSuspended) status.task_suspend_reason = stateLookup('suspend_reason', st.task_suspend_reason);
                if (status.isNetworkSuspended) status.network_suspend_reason = stateLookup('suspend_reason', st.network_suspend_reason);
                if (status.isGpuSuspended) status.gpu_suspend_reason = stateLookup('suspend_reason', st.gpu_suspend_reason);

                this.status = status;
                resolve(status);
            }).catch((err) => reject(err));
        })
    }

    getStatistics() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_statistics/>').then((stat) => {
                this.statistics = stat.boinc_gui_rpc_reply.statistics.project_statistics;
                resolve(this.statistics);
            }).catch((err) => reject(err));
        })
    }

    getWUHistory() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_old_results/>').then((wu) => {
                this.wuHistory = wu.boinc_gui_rpc_reply.old_results.old_result;
                resolve(this.wuHistory);
            }).catch((err) => reject(err));
        })
    }

    getDiskUsage() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_disk_usage/>').then((disk) => {
                this.diskUsage = disk.boinc_gui_rpc_reply.disk_usage_summary;
                resolve(this.diskUsage);
            }).catch((err) => reject(err));
        })
    }

    getServerVersion() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<exchange_versions/>').then((version) => {
                this.serverVersion = {
                    major: parseInt(version.boinc_gui_rpc_reply.server_version.major),
                    minor: parseInt(version.boinc_gui_rpc_reply.server_version.minor),
                    release: parseInt(version.boinc_gui_rpc_reply.server_version.release),
                    string: `${version.boinc_gui_rpc_reply.server_version.major}.${version.boinc_gui_rpc_reply.server_version.minor}.${version.boinc_gui_rpc_reply.server_version.release}`
                }
                resolve(this.serverVersion);
            }).catch((err) => reject(err));
        })
    }

    getMessageCount() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_message_count/>').then((count) => {
                this.messageCount = parseInt(count.boinc_gui_rpc_reply.seqno);
                resolve(this.messageCount);
            }).catch((err) => reject(err));
        })
    }

    getMessages(seqno, translatable = false) {
        return new Promise((resolve, reject) => {
            let arr = [];

            let request = '<get_messages>';
            if (seqno) {
                request += `<seqno>${parseInt(seqno)}</seqno>`;
            }
            if (translatable) {
                request += '<translatable/>';
            }

            request += '</get_messages>';
            this.rawRequest(request).then((messages) => {
                // if (this.debug) console.debug(messages.boinc_gui_rpc_reply)
                if (typeof messages.boinc_gui_rpc_reply.msgs === "object") {
                    if (!messages.boinc_gui_rpc_reply.msgs.msg[0]) arr = [messages.boinc_gui_rpc_reply.msgs.msg];
                    else messages.boinc_gui_rpc_reply.msgs.msg.forEach((e) => {
                        arr.push({
                            seqno: parseInt(e.seqno),
                            project: e.project || null,
                            priority: parseInt(e.pri) || null,
                            body: e.body.replaceAll('\n', '') || null,
                            timestamp: parseInt(e.time)
                        })
                    })
                }

                this.messages = arr;
                resolve(this.messages);
            }).catch((err) => reject(err));
        })
    }

    getProject(action) {
        return new Promise((resolve, reject) => {
            switch (action) {
                case 'list':
                    this.rawRequest('<get_all_projects_list/>').then((project) => {
                        let arr = []
                        project.boinc_gui_rpc_reply.projects.project.forEach((e) => {
                            // Strip description of CDATA tags
                            if (e.description) e.description.replaceAll(`<!CDATA[`, '').replaceAll(`]]>`, '');

                            e.platforms = e.platforms.name;

                            arr.push(e);
                        })

                        this.projectList = arr;
                        resolve(this.projectList);
                    }).catch((err) => reject(err));
                    break;
                case 'attached':
                    this.rawRequest('<get_project_status/>').then((res) => {
                        resolve(res.boinc_gui_rpc_reply.projects.project);
                    }).catch(reject);
                    break;
                default:
                    reject('Invalid action. Valid actions: list, attached');
            }
        })
    }

    getDailyTransfers() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_daily_xfer_history/>').then((transfers) => {
                let arr = [];
                transfers.boinc_gui_rpc_reply.daily_xfers.dx.forEach((e) => {
                    arr.push({
                        date: parseInt(e.when) * 86400,
                        upload: parseFloat(e.up),
                        download: parseFloat(e.down),
                        uploadFriendly: formatBytes(parseFloat(e.up)),
                        downloadFriendly: formatBytes(parseFloat(e.down))
                    })
                })
                this.xfers = arr;
                resolve(arr);
            }).catch((err) => reject(err));
        })
    }

    getNotices(onlyPublic = false) {
        return new Promise((resolve, reject) => {
            if (!onlyPublic && !this.authenticated) reject(`Unauthenticated!`);

            let request = '<get_notices';
            if (onlyPublic) request += '_public';
            this.rawRequest(`${request}/>`).then((notices) => {
                this.notices = notices.boinc_gui_rpc_reply.notices.notice;
                resolve(this.notices);
            }).catch((err) => reject(err));
        })
    }

    retryNetworkOps() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<network_available/>').then((res) => {
                resolve(Object.hasOwn(res.boinc_gui_rpc_reply, 'success'));
            }).catch((err) => reject(err));
        })
    }

    retryTransfer(projectUrl, filename) {
        return new Promise((resolve, reject) => {
            this.rawRequest(`<retry_file_transfer><project_url>${projectUrl}</project_url><filename>${filename}</filename></retry_file_transfer>`).then((res) => {
              resolve(Object.hasOwn(res.boinc_gui_rpc_reply, 'success'))
            }).catch((err) => reject(err));
        })
    }

    abortTransfer(projectUrl, filename) {
        return new Promise((resolve, reject) => {
            this.rawRequest(`<abort_file_transfer><project_url>${projectUrl}</project_url><filename>${filename}</filename></abort_file_transfer>`).then((res) => {
                resolve(Object.hasOwn(res.boinc_gui_rpc_reply, 'success'));
            }).catch((err) => reject(err));
        })
    }

    runBenchmark() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<run_benchmarks/>').then((res) => {
                resolve(Object.hasOwn(res.boinc_gui_rpc_reply, 'success'));
            }).catch((err) => reject(err));
        })
    }

    setMode(type, target, duration = null) {
        return new Promise(async (resolve, reject) => {
            switch (type) {
                case 'network':
                    if (['always', 'auto', 'never', 'restore'].includes(target)) {
                        let req = `<${target}/>`;
                        if (duration && parseInt(duration)) req += `<duration>${duration}</duration>`;
                        else req += `<duration></duration>`;

                        this.rawRequest(`<set_network_mode>${req}</set_network_mode>`).then((res) => {
                            resolve({type: 'network', result: Object.hasOwn(res.boinc_gui_rpc_reply, 'success')});
                        }).catch((err) => reject(err));
                    }
                    else reject('Invalid target.');
                    break;
                case 'run':
                    if (['always', 'auto', 'never', 'restore'].includes(target)) {
                        let req = `<${target}/>`;
                        if (duration && parseInt(duration)) req += `<duration>${duration}</duration>`;
                        else req += `<duration></duration>`;

                        this.rawRequest(`<set_run_mode>${req}</set_run_mode>`).then((res) => {
                            resolve({type: 'run', result: Object.hasOwn(res.boinc_gui_rpc_reply, 'success')});
                        }).catch((err) => reject(err));
                    }
                    else reject('Invalid target.');
                    break;
                case 'gpu':
                    if (['always', 'auto', 'never', 'restore'].includes(target)) {
                        let req = `<${target}/>`;
                        if (duration && parseInt(duration)) req += `<duration>${duration}</duration>`;
                        else req += `<duration></duration>`;

                        this.rawRequest(`<set_gpu_mode>${req}</set_gpu_mode>`).then((res) => {
                            resolve({type: 'gpu', result: Object.hasOwn(res.boinc_gui_rpc_reply, 'success')});
                        }).catch((err) => reject(err));
                    }
                    else reject('Invalid target.');
                    break;
                case 'all':
                    let reqs = ["network", "run", "gpu"].map((m) => {
                        return new Promise((r1, r2) => {
                            if (['always', 'auto', 'never', 'restore'].includes(target)) {
                                let req = `<${target}/>`;
                                if (duration && parseInt(duration)) req += `<duration>${duration}</duration>`;
                                else req += `<duration></duration>`;

                                this.rawRequest(`<set_${m}_mode>${req}</set_${m}_mode>`).then((res) => {
                                    r1({type: m, result: Object.hasOwn(res.boinc_gui_rpc_reply[0], 'success')});
                                }).catch((err) => reject(err));
                            }
                            else r2('Invalid target.');
                        })
                    })
                    let res = [];

                    for (let req of reqs) {
                        await req.then((r) => {
                            res.push(r);
                        })
                    }
                    if (this.debug) console.debug(res);
                    resolve(res);
                    break;
                default:
                    reject('Invalid type.');
            }
        })
    }

    setProject(action, options) {
        return new Promise(async (resolve, reject) => {
            let req;
            switch (action) {
                case 'reset':
                    req = `<project_reset><project_url>${options.url}</project_url></project_reset>`;
                    break;
                case 'detach':
                    req = `<project_detach><project_url>${options.url}</project_url></project_detach>`;
                    break;
                case 'update':
                    req = `<project_update><project_url>${options.url}</project_url></project_update>`;
                    break;
                case 'suspend':
                    req = `<project_suspend><project_url>${options.url}</project_url></project_suspend>`;
                    break;
                case 'resume':
                    req = `<project_resume><project_url>${options.url}</project_url></project_resume>`;
                    break;
                case 'nomorework':
                    req = `<project_nomorework><project_url>${options.url}</project_url></project_nomorework>`;
                    break;
                case 'allowmorework':
                    req = `<project_allowmorework><project_url>${options.url}</project_url></project_allowmorework>`;
                    break;
                case 'detach_when_done':
                    req = `<project_detach_when_done><project_url>${options.url}</project_url></project_detach_when_done>`;
                    break;
                case 'dont_detach_when_done':
                    req = `<project_dont_detach_when_done><project_url>${options.url}</project_url></project_dont_detach_when_done>`;
                    break;
                case 'attach':
                    //? Get seqno from latest client message. We need to compare this
                    //? to the seqno of the message we get after attaching the project
                    //? in order to check for any errors that may have occurred.
                    let seqno = await this.getMessages(false).then((msg) => msg[msg.length - 1].seqno);

                    //? Attach main request
                    this.rawRequest(`<project_attach><project_url>${options.url}</project_url><authenticator>${options.authenticator}</authenticator>${options.project_name ? `<project_name>${options.project_name}</project_name>` : `<project_name>${options.url}</project_name>`}</project_attach>`).then(async (res) => {
                        // if (this.debug) console.debug(`[ATTACH MAIN] ${JSON.stringify(res)}`);

                        //? Get existing project list so that we effectively filter out any
                        //? other currently running projects
                        const attached = await this.getProject('attached');
                        const excluded = attached.map((x) => x.project_name);

                        //* Request is async - on success, poll for completion
                        if (Object.hasOwn(res.boinc_gui_rpc_reply, 'success')) {

                            let pollInterval = setInterval(async () => {
                                this.rawRequest('<project_attach_poll/>').then(async (pres) => {
                                    if (this.debug) console.debug(`[ATTACH POLL] ${JSON.stringify(pres)}`);

                                    //! If error num is 0, we need to check client messages for any other errors
                                    //! because those are not returned here.
                                    if (parseInt(pres.boinc_gui_rpc_reply.project_attach_reply.error_num) === 0) {
                                        let newMessages = await this.getMessages(seqno).then((gm) => gm.filter((x) => !excluded.includes(x.project)));
                                        if (newMessages.length !== 0) seqno = newMessages[newMessages.length - 1].seqno;
                                        // if (this.debug) console.debug(newMessages);

                                        //? Stay in the interval until we get the confirmation that the project
                                        //? has successfully attached or we get an error message.
                                        // let projectMessages = newMessages.filter((x) => x.project === options.url || x.project === '');
                                        if (newMessages.length !== 0) {
                                            let result = {complete: false, error: false, msg: ''};
                                            for (const m of newMessages) {
                                                if (this.debug) console.debug(`includes error: ${m.body.includes('missing account key') || m.body.includes('communication failed')}`,
                                                    `includes ok: ${m.body.includes('Scheduler request completed')}`)
                                                if (m.body.includes('Invalid or missing account key') || m.body.includes('communication failed')) {
                                                    if (this.debug) console.debug(`[ATTACH POLL - MSG FILTER] ${JSON.stringify(newMessages)}`);
                                                    clearInterval(pollInterval);

                                                    result = {complete: true, error: true, msg: m.body.includes('Invalid or missing account key') ? 'Missing or invalid account key' : 'Communication failed'};
                                                } else if (m.body.includes('Scheduler request completed')) {
                                                    if (this.debug) console.debug(`[ATTACH POLL - MSG FILTER] ${JSON.stringify(newMessages)}`);
                                                    clearInterval(pollInterval);

                                                    result.complete = true;
                                                }
                                            }

                                            if (result.complete) {
                                                if (result.error) reject({
                                                    success: false,
                                                    message: result.msg
                                                })
                                                else resolve({
                                                    success: true
                                                })
                                            }
                                        }
                                    } else {
                                        if (this.debug) console.debug(pres);
                                        reject({
                                            success: false,
                                            message: pres.boinc_gui_rpc_reply.project_attach_reply.message,
                                            error_num: parseInt(pres.boinc_gui_rpc_reply.project_attach_reply.error_num)
                                        })
                                    }
                                })
                            }, 500);
                        } else {
                            if (this.debug) console.debug(`[ATTACH REJECT] ${res.boinc_gui_rpc_reply}`);
                            reject({
                                success: false,
                                message: res.boinc_gui_rpc_reply.error
                            })
                        }
                    })

                    break;
                case 'create_account':
                    reject("Not yet implemented");
                    break;
                default:
                    reject('Invalid action. Valid actions: reset, detach, attach, update, suspend, resume, nomorework, allowmorework, detach_when_done, dont_detach_when_done');
            }
        })
    }

    getAccountManager() {
        return new Promise(async (resolve, reject) => {
            this.rawRequest(`<acct_mgr_info/>`).then((res) => {
                if (this.debug) console.debug(`[ACCT_MGR_INFO] ${JSON.stringify(res)}`);
                if (Object.hasOwn(res.boinc_gui_rpc_reply, 'acct_mgr_info')) {
                    this.accountManager = res.boinc_gui_rpc_reply.acct_mgr_info;

                    ['have_credentials', 'cookie_required'].forEach((e) => {
                        if (Object.hasOwn(this.accountManager, e)) this.accountManager[e] = true;
                        else this.accountManager[e] = false;
                    });

                    resolve(this.accountManager);
                } else reject(res.boinc_gui_rpc_reply.error);
            })
        })
    }

    setAccountManager(action, options) {
        return new Promise(async (resolve, reject) => {
            switch (action) {
                case 'attach':
                case 'update':   
                    this.rawRequest(`<acct_mgr_rpc><url>${options.url}</url><name>${options.name}</name><password>${options.password}</password></acct_mgr_rpc>`).then((res) => {
                        
                        //* Request is async - on success, poll for completion
                        if (Object.hasOwn(res.boinc_gui_rpc_reply, 'success')) {
                            
                            let pollInterval = setInterval(async () => {
                                this.rawRequest('<acct_mgr_rpc_poll/>').then(async (pres) => {
                                    if (this.debug) console.debug(`[ACCT_MGR_POLL] ${JSON.stringify(pres)}`);

                                    //* -204 is ERR_IN_PROGRESS
                                    if (parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num) !== -204) {
                                        //? Stay in the interval until we get the confirmation that
                                        //? the account manager has successfully attached or we get an error message.

                                        //* 0 is success, but we probably should check if the account manager is actually attached :)
                                        if (parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num) === 0) {
                                            this.getAccountManager().then(async (acctMgr) => {
                                                if (this.debug) console.debug(acctMgr);

                                                if (acctMgr.acct_mgr_url === options.url && Object.hasOwn(acctMgr, 'have_credentials')) {
                                                    clearInterval(pollInterval);                                                    
                                                    resolve({
                                                        success: true,
                                                        ...acctMgr
                                                    })
                                                } else {
                                                    //! If error_num is 0 but the account manager is not attached, something went wrong. Return error message
                                                    if (this.debug) console.debug(pres);
                                                    clearInterval(pollInterval);
                                                    reject({
                                                        success: false,
                                                        message: pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.message,
                                                        error_num: parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num)
                                                    })
                                                }
                                            })
                                        }
                                    }
                                });
                            }, 500);
                        } else {
                            reject({success: false, message: res.boinc_gui_rpc_reply.error});
                        }
                    })
                    break;
                case 'detach':
                    this.rawRequest(`<acct_mgr_rpc><url></url><name></name><password></password></acct_mgr_rpc>`).then((res) => {
                        if (Object.hasOwn(res.boinc_gui_rpc_reply, 'success')) {
                            //* Request is async - on success, poll for completion
                            let pollInterval = setInterval(async () => {
                                this.rawRequest('<acct_mgr_rpc_poll/>').then(async (pres) => {
                                    if (this.debug) console.debug(`[ACCT_MGR_POLL] ${JSON.stringify(pres)}`);

                                    //* -204 is ERR_IN_PROGRESS
                                    if (parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num) !== -204) {
                                        //? Stay in the interval until we get the confirmation that
                                        //? the account manager has successfully detached or we get an error message.
                                        if (parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num) === 0) {
                                            this.getAccountManager().then(async (acctMgr) => {
                                                if (this.debug) console.debug(acctMgr);

                                                if (acctMgr.acct_mgr_url === '' && !acctMgr.have_credentials) {
                                                    clearInterval(pollInterval);
                                                    resolve({
                                                        success: true
                                                    })
                                                } else {
                                                    //! If error_num is 0 but the account manager is not detached, something went wrong. Return error message
                                                    if (this.debug) console.debug(pres);
                                                    clearInterval(pollInterval);
                                                    reject({
                                                        success: false,
                                                        message: pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.message,
                                                        error_num: parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num)
                                                    })
                                                }
                                            })
                                        }
                                    }
                                });
                            }, 500);
                        } else {
                            reject({success: false, message: res.boinc_gui_rpc_reply.error});
                        }
                    })
                    break;
            }
        })
    }

    getProxySettings() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_proxy_settings/>').then((res) => {
                // console.log(res);
                if (Object.keys(res.boinc_gui_rpc_reply.proxy_info).includes('no_proxy')) {
                    resolve({
                        no_proxy: true,
                        no_autodetect: Object.keys(res.boinc_gui_rpc_reply.proxy_info).includes('no_autodetect')
                    })
                } else {
                    resolve(res.boinc_gui_rpc_reply.proxy_info);
                }
            }).catch((err) => reject(err));
        })
    }
}

module.exports = { RPC, stateLookup };