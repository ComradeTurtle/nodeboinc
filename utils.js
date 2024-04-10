
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


module.exports = { stateLookup, formatBytes };