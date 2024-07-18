const { XMLValidator, XMLParser } = require('fast-xml-parser');
const { stateLookup, formatBytes } = require('./utils');
const { EventEmitter } = require('events');
const net = require('net');
const fs = require('fs');

class RPC extends EventEmitter {

    constructor(connectInfo = {hostname, port, password, debug, options}) {
        super();
        if (typeof options !== 'object') options = {};

        this.hostname = connectInfo.hostname || '127.0.0.1';
        this.port = connectInfo.port || 31416;
        this.debug = connectInfo.options.debug || false;
        
        this.socket = new net.Socket();
        this.socket.connect(this.port, this.hostname);

        this.connected = false;
        this.authenticated = false;
        if (!connectInfo.password) throw new Error('No password provided');

        if (this.debug) {
            console.debug(`Authenticating with ${this.hostname}...`);

            // open new file
            const debugPath = connectInfo.options.debugPath || 'debug.log';
            this.stream = fs.createWriteStream(debugPath, {flags: 'w'});
        }

        this.rawRequest('<auth1/>').then(async (a1) => {
            if (this.debug) console.debug(`Received nonce: ${a1.boinc_gui_rpc_reply.nonce}`);
            this.connected = true;
            this.rawRequest(`<auth2><nonce_hash>${require('crypto').createHash('md5').update(`${a1.boinc_gui_rpc_reply.nonce}${connectInfo.password}`).digest('hex')}</nonce_hash></auth2>`).then(async (a2) => {
                if (Object.hasOwn(a2.boinc_gui_rpc_reply, 'authorized')) {
                    if (this.debug) console.debug('Successfully authenticated');
                    this.authenticated = true;
                    // Get initial state
                    if (connectInfo.options.getInitialState || true) await this.getState();
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
                            reject({timestamp: Date.now(), message: 'Received invalid XML from server.'});
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
                const res = {
                    success: true,
                    request: { endpoint: 'getState' },
                    timestamp: Date.now(),
                    response: state.boinc_gui_rpc_reply.client_state
                };
                if (this.connectInfo.options.saveResponses) this.responses.state = res;
                resolve(res);
            }).catch((err) => reject({success: false, timestamp: Date.now(), request: {endpoint: 'getState'}, ...err}));
        })
    }

    getWU(activeOnly = false) {
        return new Promise((resolve, reject) => {
            let req = activeOnly ? '<get_results/>' : '<get_results><active_only>0</active_only></get_results>';
            this.rawRequest(req).then((wu) => {
                if (!wu.boinc_gui_rpc_reply.results.result) {
                    const res = {
                        success: true,
                        request: {endpoint: 'getWU', activeOnly: activeOnly},
                        timestamp: Date.now(),
                        message: []
                    }
                    if (this.connectInfo.options.saveResponses) this.responses.wu = res;
                    resolve({success: true, request: {endpoint: 'getWU', activeOnly: activeOnly}, ...res});
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
                const res = {
                    success: true,
                    request: {endpoint: 'getWU', options: {activeOnly: activeOnly}},
                    timestamp: Date.now(),
                    message: wu.boinc_gui_rpc_reply.results.result
                };
                this.responses.wu = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getWU', options: {activeOnly: activeOnly}}, ...err}));
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
                resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), timestamp: Date.now(), request: {endpoint: 'setWU', action: action, options: {project: project, name: name}}});
            }).catch((err) => reject({success: false, request: {endpoint: 'setWU', action: action, options: {project: project, name: name}}, ...err}));
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

                const res = {
                    success: true,
                    request: { endpoint: 'getMode' },
                    timestamp: Date.now(),
                    message: status
                }
                if (this.connectInfo.options.saveResponses) this.responses.mode = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getMode'}, ...err}));
        })
    }

    getStatistics() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_statistics/>').then((stat) => {
                const res = {
                    success: true,
                    request: {endpoint: 'getStatistics'},
                    timestamp: Date.now(),
                    message: stat.boinc_gui_rpc_reply.statistics.project_statistics
                };
                if (this.connectInfo.options.saveResponses) this.responses.statistics = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getStatistics'}, ...err}));
        })
    }

    getWUHistory() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_old_results/>').then((wu) => {
                const res = {
                    success: true,
                    request: {endpoint: 'getWUHistory'},
                    timestamp: Date.now(),
                    message: wu.boinc_gui_rpc_reply.old_results.old_result
                };
                if (this.connectInfo.options.saveResponses) this.responses.wuHistory = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getWUHistory'}, ...err}));
        })
    }

    getDiskUsage() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_disk_usage/>').then((disk) => {
                const res = {
                    success: true,
                    request: {endpoint: 'getDiskUsage'},
                    timestamp: Date.now(),
                    message: disk.boinc_gui_rpc_reply.disk_usage_summary
                }
                if (this.connectInfo.options.saveResponses) this.responses.diskUsage = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getDiskUsage'}, ...err}));
        })
    }

    getServerVersion() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<exchange_versions/>').then((version) => {
                const res = {
                    timestamp: Date.now(),
                    message: {
                        major: parseInt(version.boinc_gui_rpc_reply.server_version.major),
                        minor: parseInt(version.boinc_gui_rpc_reply.server_version.minor),
                        release: parseInt(version.boinc_gui_rpc_reply.server_version.release),
                        string: `${version.boinc_gui_rpc_reply.server_version.major}.${version.boinc_gui_rpc_reply.server_version.minor}.${version.boinc_gui_rpc_reply.server_version.release}`
                    }
                };
                if (this.connectInfo.options.saveResponses) this.responses.serverVersion = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getServerVersion'}, ...err}));
        })
    }

    getMessageCount() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_message_count/>').then((count) => {
                const res = {
                    success: true,
                    request: {endpoint: 'getMessageCount'},
                    timestamp: Date.now(),
                    message: parseInt(count.boinc_gui_rpc_reply.seqno)
                };
                if (this.connectInfo.options.saveResponses) this.responses.messageCount = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getMessageCount'}, ...err}));
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

                const res = {
                    success: true,
                    timestamp: Date.now(),
                    request: {endpoint: 'getMessages', options: {seqno: seqno, translatable: translatable}},
                    message: arr
                };
                if (this.connectInfo.options.saveResponses) this.responses.messages = res;
                resolve(res);
            }).catch((err) => reject({success: true, request: {endpoint: 'getMessages', options: {seqno: seqno, translatable: translatable}}, ...err}));
        })
    }

    getProject(action) {
        return new Promise((resolve, reject) => {
            switch (action) {
                case 'list':
                    this.rawRequest('<get_all_projects_list/>').then((project) => {
                        let arr = []
                        project.boinc_gui_rpc_reply.projects.project.forEach((e) => {
                            //* Strip description of CDATA tags
                            if (e.description) e.description.replaceAll(`<!CDATA[`, '').replaceAll(`]]>`, '');

                            e.platforms = e.platforms.name;

                            arr.push(e);
                        })
                        const res = {
                            success: true,
                            timestamp: Date.now(),
                            request: {endpoint: 'getProject', action: 'list'},
                            message: arr
                        };
                        if (this.connectInfo.options.saveResponses) this.responses.project.list = res;
                        resolve(res);
                    }).catch((err) => reject({success: false, request: {endpoint: 'getProject', action: 'list'}, ...err}));
                    break;
                case 'attached':
                    this.rawRequest('<get_project_status/>').then((res) => {
                        const r = {
                            success: true,
                            timestamp: Date.now(),
                            request: {endpoint: 'getProject', action: 'attached'},
                            message: res.boinc_gui_rpc_reply.projects.project
                        }
                        if (this.connectInfo.options.saveResponses) this.responses.project.attached = r;
                        resolve(r);
                    }).catch((err) => reject({success: false, request: {endpoint: 'getProject', action: 'attached'}, ...err}));
                    break;
                default:
                    reject({success: false, timestamp: Date.now(), request: {endpoint: 'getProject', action: 'attached'}, message: 'Invalid action. Valid actions: list, attached'});
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
                const res = {
                    success: true,
                    timestamp: Date.now(),
                    request: { endpoint: 'getDailyTransfers' },
                    message: arr
                };
                if (this.connectInfo.options.saveResponses) this.responses.dailyTransfers = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getDailyTransfers'}, ...err}));
        })
    }

    getNotices(onlyPublic = false) {
        return new Promise((resolve, reject) => {
            if (!onlyPublic && !this.authenticated) reject({success: false, timestamp: Date.now(), request: {endpoint: 'getNotices', options: {onlyPublic: onlyPublic}}, message: 'Unauthenticated'});

            let request = '<get_notices';
            if (onlyPublic) request += '_public';
            this.rawRequest(`${request}/>`).then((notices) => {
                const res = {
                    success: true,
                    timestamp: Date.now(),
                    request: {endpoint: 'getNotices', options: {onlyPublic: onlyPublic}},
                    message: notices.boinc_gui_rpc_reply.notices.notice
                };
                if (this.connectInfo.options.saveResponses) this.responses.notices = res;
                resolve(res);
            }).catch((err) => reject({success: false, request: {endpoint: 'getNotices', options: {onlyPublic: onlyPublic}}, ...err}));
        })
    }

    retryNetworkOps() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<network_available/>').then((res) => {
                resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'retryNetworkOps'}, timestamp: Date.now()});
            }).catch((err) => reject({success: false, request: {endpoint: 'retryNetworkOps'}, ...err}));
        })
    }

    retryTransfer(projectUrl, filename) {
        return new Promise((resolve, reject) => {
            this.rawRequest(`<retry_file_transfer><project_url>${projectUrl}</project_url><filename>${filename}</filename></retry_file_transfer>`).then((res) => {
              resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'retryTransfer', options: {projectUrl: projectUrl, filename: filename}}, timestamp: Date.now()});
            }).catch((err) => reject({success: false, request: {endpoint: 'retryTransfer', options: {projectUrl: projectUrl, filename: filename}}, ...err}));
        })
    }

    abortTransfer(projectUrl, filename) {
        return new Promise((resolve, reject) => {
            this.rawRequest(`<abort_file_transfer><project_url>${projectUrl}</project_url><filename>${filename}</filename></abort_file_transfer>`).then((res) => {
                resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'abortTransfer', options: {projectUrl: projectUrl, filename: filename}}, timestamp: Date.now()});
            }).catch((err) => reject({success: false, request: {endpoint: 'abortTransfer', options: {projectUrl: projectUrl, filename: filename}}, ...err}));
        })
    }

    runBenchmark() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<run_benchmarks/>').then((res) => {
                resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'runBenchmark'}, timestamp: Date.now()});
            }).catch((err) => reject({success: false, request: {endpoint: 'runBenchmark'}, ...err}));
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
                            resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, timestamp: Date.now()});
                        }).catch((err) => reject({success: false, request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, ...err}));
                    }
                    else reject('Invalid target.');
                    break;
                case 'run':
                    if (['always', 'auto', 'never', 'restore'].includes(target)) {
                        let req = `<${target}/>`;
                        if (duration && parseInt(duration)) req += `<duration>${duration}</duration>`;
                        else req += `<duration></duration>`;

                        this.rawRequest(`<set_run_mode>${req}</set_run_mode>`).then((res) => {
                            resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, timestamp: Date.now()});
                        }).catch((err) => reject({success: false, request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, ...err}));
                    }
                    else reject('Invalid target.');
                    break;
                case 'gpu':
                    if (['always', 'auto', 'never', 'restore'].includes(target)) {
                        let req = `<${target}/>`;
                        if (duration && parseInt(duration)) req += `<duration>${duration}</duration>`;
                        else req += `<duration></duration>`;

                        this.rawRequest(`<set_gpu_mode>${req}</set_gpu_mode>`).then((res) => {
                            resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, timestamp: Date.now()});
                        }).catch((err) => reject({success: false, request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, ...err}));
                    }
                    else reject('Invalid target.');
                    break;
                case 'all':
                    for (i of ["network", "run", "gpu"]) {
                        if (['always', 'auto', 'never', 'restore'].includes(target)) {
                            let req = `<${target}/>`;
                            if (duration && parseInt(duration)) req += `<duration>${duration}</duration>`;
                            else req += `<duration></duration>`;

                            this.rawRequest(`<set_${m}_mode>${req}</set_${m}_mode>`).catch((err) => {
                                reject({success: false, request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, ...err}); 
                            });
                        }
                        else reject({success: false, request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, timestamp: Date.now(), message: 'Invalid target'});
                    }
                    break;
                default:
                    reject({success: false, request: {endpoint: 'setMode', options: {type: type, target: target, duration: duration}}, timestamp: Date.now(), message: 'Invalid type'});
            }
        })
    }

    setProject(action, options) {
        return new Promise(async (resolve, reject) => {
            let req;
            switch (action) {
                case 'reset':
                case 'detach':
                case 'update':
                case 'suspend':
                case 'resume':
                case 'nomorework':
                case 'allowmorework':
                case 'detach_when_done':
                case 'dont_detach_when_done':               
                    req = `<project_${action}><project_url>${options.url}</project_url></project_${action}>`;
                    this.rawRequest(req).then((res) => {
                        resolve({success: Object.hasOwn(res.boinc_gui_rpc_reply, 'success'), request: {endpoint: 'setProject', options: {action: action, ...options}}, timestamp: Date.now()});
                    }).catch((err) => reject({success: false, request: {endpoint: 'setProject', options: {action: action, ...options}}, ...err}));
                    break;
                case 'attach':
                    //? Get seqno from latest client message. We need to compare this
                    //? to the seqno of the message we get after attaching the project
                    //? in order to check for any errors that may have occurred.
                    let seqno = await this.getMessages(false).then((msg) => msg[msg.length - 1].seqno);

                    //? Attach main request
                    this.rawRequest(`<project_attach><project_url>${options.url}</project_url><authenticator>${options.authenticator}</authenticator>${options.project_name ? `<project_name>${options.project_name}</project_name>` : `<project_name>${options.url}</project_name>`}</project_attach>`).then(async (res) => {
                        if (this.debug) console.debug(`[ATTACH MAIN] ${JSON.stringify(res)}`);

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
                                                    result.msg = 'Scheduler request completed';
                                                }
                                            }

                                            if (result.complete) {
                                                if (result.error) reject({
                                                    success: false,
                                                    timestamp: Date.now(),
                                                    request: { endpoint: 'setProject', options: {action: action, ...options}},
                                                    message: result.msg
                                                })
                                                else resolve({
                                                    success: true,
                                                    timestamp: Date.now(),
                                                    request: { endpoint: 'setProject', options: {action: action, ...options}},
                                                    message: result.msg
                                                })
                                            }
                                        }
                                    } else {
                                        if (this.debug) console.debug(pres);
                                        reject({
                                            success: false,
                                            message: pres.boinc_gui_rpc_reply.project_attach_reply.message,
                                            request: { endpoint: 'setProject', options: {action: action, ...options}},
                                            ...(this.connectInfo.options.resolveErrorNumbers && {error_num: parseInt(pres.boinc_gui_rpc_reply.project_attach_reply.error_num)})
                                        })
                                    }
                                })
                            }, parseInt(this.connectInfo.options.pollInterval));
                        } else {
                            if (this.debug) console.debug(`[ATTACH REJECT] ${res.boinc_gui_rpc_reply}`);
                            reject({
                                success: false,
                                timestamp: Date.now(),
                                request: { endpoint: 'setProject', options: {action: action, ...options}},
                                message: res.boinc_gui_rpc_reply.error
                            })
                        }
                    })

                    break;
                case 'create_account':
                    reject({
                        success: false,
                        timestamp: Date.now(),
                        request: { endpoint: 'setProject', options: {action: action, ...options}},
                        message: 'Not yet implemented'
                    });
                    break;
                default:
                    reject({
                        success: false,
                        timestamp: Date.now(),
                        request: { endpoint: 'setProject', options: {action: action, ...options}},
                        message: 'Invalid action. Valid actions: reset, detach, attach, update, suspend, resume, nomorework, allowmorework, detach_when_done, dont_detach_when_done'
                    });
            }
        })
    }

    getAccountManager() {
        return new Promise(async (resolve, reject) => {
            this.rawRequest(`<acct_mgr_info/>`).then((res) => {
                if (this.debug) console.debug(`[ACCT_MGR_INFO] ${JSON.stringify(res)}`);
                if (Object.hasOwn(res.boinc_gui_rpc_reply, 'acct_mgr_info')) {
                    const res = {
                        success: true,
                        request: { endpoint: 'getAccountManager' },
                        timestamp: Date.now(),
                        message: res.boinc_gui_rpc_reply.acct_mgr_info
                    };

                    ['have_credentials', 'cookie_required'].forEach((e) => {
                        if (Object.hasOwn(this.accountManager, e)) res[e] = true;
                        else res[e] = false;
                    });

                    if (this.connectInfo.options.saveResponses) this.responses.accountManager = res;
                    resolve(res);
                } else reject({success: false, request: { endpoint: 'getAccountManager' }, timestamp: Date.now(), message: res.boinc_gui_rpc_reply.error});
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
                            }, parseInt(this.connectInfo.options.pollInterval) || 500);
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
                                                        ...acctMgr,
                                                        request: { endpoint: 'setAccountManager', options: { action: action, ...options }},
                                                        timestamp: Date.now()
                                                    })
                                                } else {
                                                    //! If error_num is 0 but the account manager is not detached, something went wrong. Return error message
                                                    if (this.debug) console.debug(pres);
                                                    clearInterval(pollInterval);
                                                    reject({
                                                        success: false,
                                                        timestamp: Date.now(),
                                                        request: { endpoint: 'setAccountManager', options: { action: action, ...options }},
                                                        message: pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.message,
                                                        error_num: parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num)
                                                        (this.connectInfo.options.resolveErrorNumbers && { error_desc: stateLookup('freturn', parseInt(pres.boinc_gui_rpc_reply.acct_mgr_rpc_reply.error_num))})
                                                    });
                                                }
                                            })
                                        }
                                    }
                                });
                            }, parseInt(this.connectInfo.options.pollInterval) || 500);
                        } else {
                            reject({success: false, timestamp: Date.now(), request: { endpoint: 'setAccountManager', options: { action: action, ...options }}, message: res.boinc_gui_rpc_reply.error});
                        }
                    })
                    break;
            }
        })
    }

    getProxySettings() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_proxy_settings/>').then((res) => {
                let r;
                if (Object.keys(res.boinc_gui_rpc_reply.proxy_info).includes('no_proxy')) {
                    r = {
                        success: true,
                        timestamp: Date.now(),
                        request: { endpoint: 'getProxySettings' },
                        message: {
                            no_proxy: true,
                            no_autodetect: Object.keys(res.boinc_gui_rpc_reply.proxy_info).includes('no_autodetect')
                        }
                    }
                    if (this.connectInfo.options.saveResponses) this.responses.proxy = r;
                } else {
                    r = {
                        success: true,
                        timestamp: Date.now(),
                        request: { endpoint: 'getProxySettings' },
                        message: res.boinc_gui_rpc_reply.proxy_info
                    };
                    if (this.connectInfo.options.saveResponses) this.responses.proxy = r;
                }
                resolve(r);
            }).catch((err) => reject({
                success: false,
                timestamp: Date.now(),
                request: { endpoint: 'getProxySettings' },
                message: err
            }));
        })
    }
}

module.exports = { RPC, stateLookup };