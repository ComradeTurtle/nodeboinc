const { XMLValidator, XMLParser } = require('fast-xml-parser');
const { EventEmitter } = require('events');
const net = require('net');

const stateLookup = (type, state) => {
    /*
    Values of active_task.scheduler_state
        0 => UNINITIALIZED
        1 => PREEMTED
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
                    return 'PREEMTED';
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
                    return 'WIFI_STATE'; // Wifi is off
                case 4098:
                    return 'BATTERY_CHARGING'; // Battery is charging
                case 4099:
                    return 'BATTERY_OVERHEATED'; // Battery is overheated
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
            }
        default:
            return 'UNKNOWN';
    }
}

class RPC extends EventEmitter {
    constructor(hostname = '127.0.0.1', port = 31416, password) {
        super();
        this.socket = new net.Socket();
        this.socket.connect(port, hostname);

        this.hostname = hostname;
        if (!password) throw new Error('No password provided');

        this.password = password;
        console.log(`Authenticating with ${this.hostname}...`);

        this.rawRequest('<auth1/>').then(async (a1) => {
            console.log(`Received nonce: ${a1.boinc_gui_rpc_reply.nonce}`);

            this.rawRequest(`<auth2><nonce_hash>${require('crypto').createHash('md5').update(`${a1.boinc_gui_rpc_reply.nonce}${this.password}`).digest('hex')}</nonce_hash></auth2>`).then(async (a2) => {
                if (Object.hasOwn(a2.boinc_gui_rpc_reply, 'authorized')) {
                    console.log('Successfully authenticated');
                    // Get initial state
                    await this.getState();
                    console.log(`Fetched initial state from client.`);
                    this.emit('ready');
                } else {
                    throw new Error('Failed to authenticate');
                }
            })
        })
    }

    rawRequest(request) {
        const body = '<boinc_gui_rpc_request>' + request + '</boinc_gui_rpc_request>' + '\x03';
        return new Promise((resolve, reject) => {
            this.socket.write(body);

            let response = '';
            this.socket.on('data', (data) => {
                response += data.toString();

                // Both requests and replies are terminated with the control character 0x03. 
                if (response.endsWith('\x03')) {
                    if (data) {
                        // response += data.toString();
                        // const xml = response.split('\n\n')[1];
                        const parser1 = new XMLParser();
                        // console.log(response);
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
            })
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
            })
        })
    }

    getStatus() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_cc_status/>').then((stat) => {
                let st = stat.boinc_gui_rpc_reply.cc_status;
                let status = {
                    network_status: parseInt(st.network_mode),
                    network_status_friendly: stateLookup('network_status', st.network_mode),
                    network_status_selected: parseInt(st.network_mode_perm),
                    isTaskSuspended: parseInt(st.task_suspend_reason) == 0,
                    task_suspend_reason: stateLookup('task_suspend_reason', st.task_suspend_reason),
                    isNetworkSuspended: parseInt(st.network_suspend_reason) == 0,
                    network_suspend_reason: stateLookup('network_suspend_reason', st.network_suspend_reason),
                    isGpuSuspended: parseInt(st.gpu_suspend_reason) == 0,
                    gpu_suspend_reason: stateLookup('gpu_suspend_reason', st.gpu_suspend_reason),
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
                this.status = status;
                resolve(status);
            })
        })
    }

    getStatistics() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_statistics/>').then((stat) => {
                this.statistics = stat.boinc_gui_rpc_reply.statistics.project_statistics;
                resolve(this.statistics);
            })
        })
    }

    getWUHistory() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_old_results/>').then((wu) => {
                this.wuHistory = wu.boinc_gui_rpc_reply.old_results.old_result;
                resolve(this.wuHistory);
            })
        })
    }

    getDiskUsage() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_disk_usage/>').then((disk) => {
                this.diskUsage = disk.boinc_gui_rpc_reply.disk_usage_summary;
                resolve(this.diskUsage);
            })
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
            })
        })
    }

    getMessageCount() {
        return new Promise((resolve, reject) => {
            this.rawRequest('<get_message_count/>').then((count) => {
                this.messageCount = parseInt(count.boinc_gui_rpc_reply.seqno);
                resolve(this.messageCount);
            })
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
                messages.boinc_gui_rpc_reply.msgs.msg.forEach((e) => {
                    arr.push({
                        seqno: parseInt(e.seqno),
                        project: e.project,
                        priority: parseInt(e.pri),
                        body: e.body.replaceAll('\n', ''),
                        timestamp: parseInt(e.time)
                    })
                })

                this.messages = arr;
                resolve(this.messages);
            })
        })
    }
}

module.exports = { RPC, stateLookup };