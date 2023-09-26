const { XMLValidator, XMLParser } = require('fast-xml-parser');
const { EventEmitter } = require('events');
const net = require('net');
const fs = require('fs');

const stateLookup = (type, state) => {
    /*
    Values of active_task.scheduler_state
        0 => UNINITIALIZED
        1 => PREEMPTED
        2 => SCHEDULED (=EXECUTING unless CPU throttling is in use)

    Values of state
        0 => NEW
        1 => FILES_DOWNLOADING (Input files for result (WU, app version) are being downloaded)
        2 => FILES_DOWNLOADED (Files are downloaded, result can be (or is being) computed)
        3 => COMPUTE_ERROR
        4 => FILES_UPLOADING
        5 => FILES_UPLOADED (Task complete; notify scheduler)
        6 => ABORTED
        7 => UPLOAD_FAILED

    Values of active_task.task_state
        0 => UNINITIALIZED
        1 => EXECUTING
        9 => SUSPENDED ("suspend" has been sent)
        5 => ABORT_PENDING (process exceeded limits? "abort" sent, waiting for exit)
        8 => QUIT_PENDING ("quit" sent, waiting for exit)
        10 => COPY_PENDING

    Values of suspend_reason
        NOT_SUSPENDED          =    0
        BATTERIES              =    1
        USER_ACTIVE            =    2
        USER_REQ               =    4
        TIME_OF_DAY            =    8
        BENCHMARKS             =   16
        DISK_SIZE              =   32
        CPU_THROTTLE           =   64
        NO_RECENT_INPUT        =  128
        INITIAL_DELAY          =  256
        EXCLUSIVE_APP_RUNNING  =  512
        CPU_USAGE              = 1024
        NETWORK_QUOTA_EXCEEDED = 2048
        OS                     = 4096
        WIFI_STATE             = 4097
        BATTERY_CHARGING       = 4098
        BATTERY_OVERHEATED     = 4099

    Values of run_mode
        ALWAYS                 =    1
        AUTO                   =    2
        NEVER                  =    3
        RESTORE                =    4
    
    Values of network_status
        ONLINE                 =    0  // have network connections open
        WANT_CONNECTION        =    1  // need a physical connection
        WANT_DISCONNECT        =    2  // don't have any connections, and don't need any
        LOOKUP_PENDING         =    3  // a website lookup is pending (try again later)
    */

    switch (type) {
        case 'scheduler_state':
            switch (state) {
                case 0:
                    return 'UNINITIALIZED';
                case 1:
                    return 'PREEMPTED';
                case 2:
                    return 'SCHEDULED';
                default:
                    return 'UNKNOWN';
            }
        case 'state':
            switch (state) {
                case 0:
                    return 'NEW';
                case 1:
                    return 'FILES_DOWNLOADING';
                case 2:
                    return 'FILES_DOWNLOADED';
                case 3:
                    return 'COMPUTE_ERROR';
                case 4:
                    return 'FILES_UPLOADING';
                case 5:
                    return 'FILES_UPLOADED';
                case 6:
                    return 'ABORTED';
                case 7:
                    return 'UPLOAD_FAILED';
                default:
                    return 'UNKNOWN';
            }
        case 'task_state':
            switch (state) {
                case 0:
                    return 'UNINITIALIZED';
                case 1:
                    return 'EXECUTING';
                case 5:
                    return 'ABORT_PENDING';
                case 8:
                    return 'QUIT_PENDING';
                case 9:
                    return 'SUSPENDED';
                case 10:
                    return 'COPY_PENDING';
                default:
                    return 'UNKNOWN';
            }
        case 'suspend_reason':
            switch (state) {
                case 0:
                    return 'NOT_SUSPENDED';
                case 1:
                    return 'BATTERIES';
                case 2:
                    return 'USER_ACTIVE';
                case 4:
                    return 'USER_REQ';
                case 8:
                    return 'TIME_OF_DAY';
                case 16:
                    return 'BENCHMARKS';
                case 32:
                    return 'DISK_SIZE'; // Need disk space - check preferences
                case 64:
                    return 'CPU_THROTTLE';
                case 128:
                    return 'NO_RECENT_INPUT'; // No recent user activity?
                case 256:
                    return 'INITIAL_DELAY'; // Initial delay?
                case 512:
                    return 'EXCLUSIVE_APP_RUNNING'; // An exclusive app is running
                case 1024:
                    return 'CPU_USAGE'; // CPU is busy
                case 2048:
                    return 'NETWORK_QUOTA_EXCEEDED'; // Network bandwidth limit exceeded
                case 4096:
                    return 'OS'; // Requested by OS
                case 4097:
                    return 'WIFI_STATE'; // Wi-Fi is off
                case 4098:
                    return 'BATTERY_CHARGING'; // Battery is charging
                case 4099:
                    return 'BATTERY_OVERHEATED'; // Battery is overheated
                default:
                    return 'UNKNOWN';
            }
        case 'run_mode':
            switch (state) {
                case 1:
                    return 'ALWAYS';
                case 2:
                    return 'AUTO';
                case 3:
                    return 'NEVER';
                case 4:
                    return 'RESTORE'; // Restore permanent mode?
                default:
                    return 'UNKNOWN'
            }
        case 'network_status':
            switch (state) {
                case 0:
                    return 'ONLINE';
                case 1:
                    return 'WANT_CONNECTION';
                case 2:
                    return 'WANT_DISCONNECT';
                case 3:
                    return 'LOOKUP_PENDING';
                default:
                    return 'UNKNOWN';
            }
        default:
            return 'UNKNOWN';
    }
}

const formatBytes = (n, decimals = 2) => {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(decimals)} KB`;
    if (n < 1073741824) return `${(n / 1048576).toFixed(decimals)} MB`;
    return `${(n / 1073741824).toFixed(decimals)} GB`;
}

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
            while (this.mutex) {

            }
            this.mutex = true;
            this.socket.write(body);
            this.stream.write(`[REQUEST] ${body}\n`);

            let response = '';
            this.socket.on('data', (data) => {
                response += data.toString();

                // Both requests and replies are terminated with the control character 0x03. 
                if (response.endsWith('\x03')) {
                    if (data) {
                        this.mutex = false;
                        this.stream.write(`[RESPONSE] ${response}\n\n`);
                        // response += data.toString();
                        // const xml = response.split('\n\n')[1];
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

                        //* On success, poll for completion
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
                                        // if (this.debug) console.debug(pres);
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