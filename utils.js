
const stateLookup = (type, state) => {
    /*
    ! Sourced from https://github.com/BOINC/boinc/ and https://github.com/MestreLion/boinc-indicator
    ! Licensed under GNU LGPL v3
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
        case 'freturn':
            switch (state) {
                case 0:
                    return "SUCCESS";
                case -100:
                    return "ERR_SELECT";
                case -101:
                    return "ERR_MALLOC";
                case -102:
                    return "ERR_READ";
                case -103:
                    return "ERR_WRITE";
                case -104:
                    return "ERR_FREAD";
                case -105:
                    return "ERR_FWRITE";
                case -106:
                    return "ERR_IO";
                case -107:
                    return "ERR_CONNECT";
                case -108:
                    return "ERR_FOPEN";
                case -109:
                    return "ERR_RENAME";
                case -110:
                    return "ERR_UNLINK";
                case -111:
                    return "ERR_OPENDIR";
                case -112:
                    return "ERR_XML_PARSE";
                case -113:
                    return "ERR_GETHOSTBYNAME";
                case -114:
                    return "ERR_GIVEUP_DOWNLOAD";
                case -115:
                    return "ERR_GIVEUP_UPLOAD";
                case -116:
                    return "ERR_NULL";
                case -117:
                    return "ERR_NEG";
                case -118:
                    return "ERR_BUFFER_OVERFLOW";
                case -119:
                    return "ERR_MD5_FAILED";
                case -120:
                    return "ERR_RSA_FAILED";
                case -121:
                    return "ERR_OPEN";
                case -122:
                    return "ERR_DUP2";
                case -123:
                    return "ERR_NO_SIGNATURE";
                case -124:
                    return "ERR_THREAD";
                case -125:
                    return "ERR_SIGNAL_CATCH";
                case -126:
                    return "ERR_BAD_FORMAT";
                case -127:
                    return "ERR_UPLOAD_TRANSIENT";
                case -128:
                    return "ERR_UPLOAD_PERMANENT";
                case -129:
                    return "ERR_IDLE_PERIOD";
                case -130:
                    return "ERR_ALREADY_ATTACHED";
                case -131:
                    return "ERR_FILE_TOO_BIG";
                case -132:
                    return "ERR_GETRUSAGE";
                case -133:
                    return "ERR_BENCHMARK_FAILED";
                case -134:
                    return "ERR_BAD_HEX_FORMAT";
                case -135:
                    return "ERR_GETADDRINFO";
                case -136:
                    return "ERR_DB_NOT_FOUND";
                case -137:
                    return "ERR_DB_NOT_UNIQUE";
                case -138:
                    return "ERR_DB_CANT_CONNECT";
                case -139:
                    return "ERR_GETS";
                case -140:
                    return "ERR_SCANF";
                case -143:
                    return "ERR_READDIR";
                case -144:
                    return "ERR_SHMGET";
                case -145:
                    return "ERR_SHMCTL";
                case -146:
                    return "ERR_SHMAT";
                case -147:
                    return "ERR_FORK";
                case -148:
                    return "ERR_EXEC";
                case -149:
                    return "ERR_NOT_EXITED";
                case -150:
                    return "ERR_NOT_IMPLEMENTED";
                case -151:
                    return "ERR_GETHOSTNAME";
                case -152:
                    return "ERR_NETOPEN";
                case -153:
                    return "ERR_SOCKET";
                case -154:
                    return "ERR_FCNTL";
                case -155:
                    return "ERR_AUTHENTICATOR";
                case -156:
                    return "ERR_SCHED_SHMEM";
                case -157:
                    return "ERR_ASYNCSELECT";
                case -158:
                    return "ERR_BAD_RESULT_STATE";
                case -159:
                    return "ERR_DB_CANT_INIT";
                case -160:
                    return "ERR_NOT_UNIQUE";
                case -161:
                    return "ERR_NOT_FOUND";
                case -162:
                    return "ERR_NO_EXIT_STATUS";
                case -163:
                    return "ERR_FILE_MISSING";
                case -164:
                    return "ERR_KILL";
                case -165:
                    return "ERR_SEMGET";
                case -166:
                    return "ERR_SEMCTL";
                case -167:
                    return "ERR_SEMOP";
                case -168:
                    return "ERR_FTOK";
                case -169:
                    return "ERR_SOCKS_UNKNOWN_FAILURE";
                case -170:
                    return "ERR_SOCKS_REQUEST_FAILED";
                case -171:
                    return "ERR_SOCKS_BAD_USER_PASS";
                case -172:
                    return "ERR_SOCKS_UNKNOWN_SERVER_VERSION";
                case -173:
                    return "ERR_SOCKS_UNSUPPORTED";
                case -174:
                    return "ERR_SOCKS_CANT_REACH_HOST";
                case -175:
                    return "ERR_SOCKS_CONN_REFUSED";
                case -176:
                    return "ERR_TIMER_INIT";
                case -178:
                    return "ERR_INVALID_PARAM";
                case -179:
                    return "ERR_SIGNAL_OP";
                case -180:
                    return "ERR_BIND";
                case -181:
                    return "ERR_LISTEN";
                case -182:
                    return "ERR_TIMEOUT";
                case -183:
                    return "ERR_PROJECT_DOWN";
                case -184:
                    return "ERR_HTTP_TRANSIENT";
                case -185:
                    return "ERR_RESULT_START";
                case -186:
                    return "ERR_RESULT_DOWNLOAD";
                case -187:
                    return "ERR_RESULT_UPLOAD";
                case -188:
                    return "ERR_BAD_USER_NAME";
                case -189:
                    return "ERR_INVALID_URL";
                case -190:
                    return "ERR_MAJOR_VERSION";
                case -191:
                    return "ERR_NO_OPTION";
                case -192:
                    return "ERR_MKDIR";
                case -193:
                    return "ERR_INVALID_EVENT";
                case -194:
                    return "ERR_ALREADY_RUNNING";
                case -195:
                    return "ERR_NO_APP_VERSION";
                case -196:
                    return "ERR_WU_USER_RULE";
                case -197:
                    return "ERR_ABORTED_VIA_GUI";
                case -198:
                    return "ERR_INSUFFICIENT_RESOURCE";
                case -199:
                    return "ERR_RETRY";
                case -200:
                    return "ERR_WRONG_SIZE";
                case -201:
                    return "ERR_USER_PERMISSION";
                case -202:
                    return "ERR_SHMEM_NAME";
                case -203:
                    return "ERR_NO_NETWORK_CONNECTION";
                case -204:
                    return "ERR_IN_PROGRESS";
                case -205:
                    return "ERR_BAD_EMAIL_ADDR";
                case -206:
                    return "ERR_BAD_PASSWD";
                case -207:
                    return "ERR_NONUNIQUE_EMAIL";
                case -208:
                    return "ERR_ACCT_CREATION_DISABLED";
                case -209:
                    return "ERR_ATTACH_FAIL_INIT";
                case -210:
                    return "ERR_ATTACH_FAIL_DOWNLOAD";
                case -211:
                    return "ERR_ATTACH_FAIL_PARSE";
                case -212:
                    return "ERR_ATTACH_FAIL_BAD_KEY";
                case -213:
                    return "ERR_ATTACH_FAIL_FILE_WRITE";
                case -214:
                    return "ERR_ATTACH_FAIL_SERVER_ERROR";
                case -215:
                    return "ERR_SIGNING_KEY";
                case -216:
                    return "ERR_FFLUSH";
                case -217:
                    return "ERR_FSYNC";
                case -218:
                    return "ERR_TRUNCATE";
                case -219:
                    return "ERR_WRONG_URL";
                case -220:
                    return "ERR_DUP_NAME";
                case -221:
                    return "ERR_FILE_WRONG_SIZE";
                case -222:
                    return "ERR_GETGRNAM";
                case -223:
                    return "ERR_CHOWN";
                case -224:
                    return "ERR_HTTP_PERMANENT";
                case -225:
                    return "ERR_BAD_FILENAME";
                case -226:
                    return "ERR_TOO_MANY_EXITS";
                case -227:
                    return "ERR_RMDIR";
                case -229:
                    return "ERR_SYMLINK";
                case -230:
                    return "ERR_DB_CONN_LOST";
                case -231:
                    return "ERR_CRYPTO";
                case -232:
                    return "ERR_ABORTED_ON_EXIT";
                case -235:
                    return "ERR_PROC_PARSE";
                case -236:
                    return "ERR_STATFS";
                case -237:
                    return "ERR_PIPE";
                case -238:
                    return "ERR_NEED_HTTPS";
                case -239:
                    return "ERR_CHMOD";
                case -240:
                    return "ERR_STAT";
                case -241:
                    return "ERR_FCLOSE";
                case -242:
                    return "ERR_ACCT_REQUIRE_CONSENT";
                case -243:
                    return "ERR_INVALID_STATE";
                default:
                    return "Unknown Error Code";
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