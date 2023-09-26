# nodeboinc
A simple Node.js module that interfaces with local and remote BOINC Client instances.

Currently tested and working with BOINC Client versions:

**Windows:**
 - Version >=**7.16.20**

**Linux:**
 - Version: >=**7.16.6**

## Installation
Just install module `nodeboinc` with your favorite package manager.

**NPM**:
`npm i nodeboinc`

**Yarn**:
`yarn add nodeboinc`


## Usage
```js
const { RPC } = require('nodeboinc');

let connection = new RPC({
	hostname: '127.0.0.1',
	port: 31416,
	password: 'password'
});

connection.on('ready', () => {
	// Your code!
})
```

## Currently implemented methods:
- `getState()`: Returns the current client state. **Note: This is currently being run automatically when the connection is established.**


- `getWU(activeOnly)`: Returns current workunits
	- activeOnly (boolean): Only return currently active workunits


- `getMode()`: Returns current run status (execution modes, suspension reasons, etc)


- `getStatistics()`: Returns available statistics per project 


- `getWUHistory()`: Returns old tasks **Note: (it is not specified by the BOINC documentation how far back the task history spans!)**


- `getDiskUsage()`: Returns total and per project disk usage


- `getServerVersion()`: Returns the BOINC client version


- `getMessageCount()`: Returns the number of messages in the log


- `getMessages(seqno, translatable)`: Returns messages from the log
	- seqno (optional, int): Start messages from this sequence number
	- translatable (optional, boolean, default: false)


- `getProject(action)`: Returns project information
	- action (string): One of "list", "attached". 
      - "list" returns the list of available projects (the same one as shown in Tools > Add project using the BOINC Manager)
      - "attached" returns the list of currently attached projects.


- `getDailyTransfers()`: Returns daily network transfer history.


- `getNotices(onlyPublic)`: Returns private and non-private notices.
	- onlyPublic (optional, boolean, default: false): If true, only public notices will be returned.


- `retryNetworkOps()`: Immediately retry all pending network operations. Returns true if the request was successful


- `retryTransfer(projectUrl, filename)`: Immediately retry a single pending network operation. Returns true if the request was successful
  - projectUrl (string): The URL of the project to retry the transfer for
  - fileName (string): The name of the file to retry the transfer for


- `abortTransfer(projectUrl, filename)`: Immediately abort a single pending network operation. Returns true if the request was successful
	- projectUrl (string): The URL of the project to abort the transfer for
	- fileName (string): The name of the file to abort the transfer for


- `runBenchmarks()`: Commands the BOINC client to start the CPU benchmark. Returns true if the request was successful


- `setMode(type, target, duration)`: Sets the run mode for the specified type. If mode is set to "all", all types will be set to the specified target for the specified duration. Returns an object in the form of {type: type, result: true/false}
	- type (one of "run", "gpu", "network", "all")
	- target (one of "always", "never", "auto", "restore")
	- duration (optional, int, default: null): If duration is not specified, the change will be permanent.


- `setProject(action, options)`: Various project operations.
  - action (one of "reset", "detach", "attach", "update", "suspend", "resume", "nomorework", "allowmorework", "detach_when_done", "dont_detach_when_done", "get_init_status", "get_config", "create_account")
    - **NOTE:** Currently, attaching a project using a file and the "create_account" method are not implemented.
  - options (object):
    - url (string): The URL of the project to perform the action on
    - authenticator (string): Only used for attaching. The user's (weak) account key for the project.
    - project_name (string): Only used for attaching. Manually sets the name of the project to be attached.

- `getProxySettings()`: Returns the current proxy settings