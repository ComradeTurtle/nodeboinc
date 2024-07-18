# nodeboinc
***WARNING: This code is still in early WIP, but most components are already working. It has NOT been thoroughly tested yet has not been published to npm.***

A simple Node.js module that interfaces with local and remote BOINC Client instances.

Currently tested and working with BOINC Client versions:

**Windows:**
 - Version >= **7.16.20**

**Linux:**
 - Version: >= **7.16.6**

## Installation
Just install module `nodeboinc` with your favorite package manager.

**NPM**:
`npm i nodeboinc`

**Yarn**:
`yarn add nodeboinc`


## Usage
```js
const { RPC } = require('nodeboinc');

const connection = new RPC({
	hostname: '127.0.0.1',
	port: 31416,
	password: 'password',
	options: {
		...
	}
});

connection.on('ready', () => {
	// Your code!
})
```

## Options
##### Optional parameters that can be passed to the RPC constructor in the `options` object.
- `getInitialState` **(boolean, default = true)**: Whether or not the entire client state should be fetched when the connection is first established.
- `resolveErrorNumbers` **TO BE IMPLEMENTED (boolean, default = true)**: Whether or not to resolve the respective error description of error numbers returned by the BOINC Client (when applicable).
- `enablePolling` **TO BE IMPLEMENTED (boolean, default = true)**: Whether or not to enable polling for asychronous requests. This is used in the asynchronous requests defined below.
- `pollInterval` **(number, default = 500)**: The time interval in milliseconds between polling requests. This is used in the following asynchronous requests:
	- `setProject('attach')`
	- `setAccountManager('attach')`
	- `setAccountManager('update')`
- `saveResponses` **(boolean, default = true)**: If enabled, all methods that make a request to the BOINC client will save the response received from it in the `state` object of the connection. Refer to the implemented methods for more information.
	- The state object for each method has the following format:
	```js
	connection.responses.workunits = {
		timestamp: // Unix timestamp of last response
		request: // Type / options passed to the request 
		message: // As received from the BOINC Client
	}
	```
- `debug` **(boolean, default = false)**: Enables debug output in the console and logs all requests/responses to a file.
- `debugPath` **(string, default = 'debug.log')**: Defines the path where the debug log should be created if debug is enabled.

## Currently implemented methods:
All methods currently return a promise. Response format for all methods is the following:
```js
{
	success: true/false,
	timestamp: // Unix timestamp of response
	request: // Type / options passed to the request
	message: // As received from the BOINC Client
}
```

- `rawRequest(payload)`: Is used internally by all other methods. Used for sending raw XML to the BOINC Client. The payload should NOT contain the outer `<boinc_gui_rpc_request>` tag.

- `getState()`: Returns the current client state. **Note: By default, this is being run automatically when the connection is established. Refer to the `getInitialState` option.** *Response saved in `connection.responses.state`*


- `getWU(activeOnly)`: Returns current workunits. *Response saved in `connection.responses.wu`*
	- activeOnly **(optional, boolean, default = false)**: Only return currently active workunits


- `getMode()`: Returns current run status (execution modes, suspension reasons, etc). *Response saved in `connection.responses.mode`*


- `getStatistics()`: Returns available statistics per project. *Response saved in `connection.responses.statistics`*


- `getWUHistory()`: Returns old tasks. *Response saved in `connection.responses.wuHistory`* **Note: (it is not specified by the BOINC documentation how far back the task history spans!)**


- `getDiskUsage()`: Returns total and per project disk usage. *Response saved in `connection.responses.diskUsage`*


- `getServerVersion()`: Returns the BOINC client version. *Response saved in `connection.responses.serverVersion`*


- `getMessageCount()`: Returns the number of messages in the log. *Response saved in `connection.responses.messageCount`*


- `getMessages(seqno, translatable)`: Returns messages from the log. *Response saved in `connection.responses.messages`*
	- seqno **(optional, int)**: Start messages from this sequence number
	- translatable **(optional, boolean, default: false)**


- `getProject(action)`: Returns project information. 
	- action **(string)**: One of "list", "attached". 
      - "list" returns the list of available projects (the same one as shown in Tools > Add project using the BOINC Manager). *Response saved in `connection.responses.project.list`*
      - "attached" returns the list of currently attached projects. *Response saved in `connection.responses.project.attached`*


- `getDailyTransfers()`: Returns daily network transfer history. *Response saved in `connection.responses.dailyTransfers`*


- `getNotices(onlyPublic)`: Returns private and non-private notices. *Response saved in `connection.responses.notices`*
	- onlyPublic **(optional, boolean, default: false)**: If true, only public notices will be returned.


- `retryNetworkOps()`: Immediately retry all pending network operations. Returns true if the request was successful


- `retryTransfer(projectUrl, filename)`: Immediately retry a single pending network operation. Returns true if the request was successful
  - projectUrl **(string)**: The URL of the project to retry the transfer for
  - fileName **(string)**: The name of the file to retry the transfer for


- `abortTransfer(projectUrl, filename)`: Immediately abort a single pending network operation. Returns true if the request was successful
	- projectUrl **(string)**: The URL of the project to abort the transfer for
	- fileName **(string)**: The name of the file to abort the transfer for


- `runBenchmarks()`: Commands the BOINC client to start the CPU benchmark. Returns true if the request was successful


- `setMode(type, target, duration)`: Sets the run mode for the specified type. If mode is set to "all", all types will be set to the specified target for the specified duration. Returns an object in the form of {type: type, result: true/false}
	- type **(string, one of "run", "gpu", "network", "all")**
	- target **(string, one of "always", "never", "auto", "restore")**
	- duration **(optional, integer, default: null)**: If duration is 0 or not specified, the change will be permanent.


- `setProject(action, options)`: Various project operations.
  - action **(string, one of "reset", "detach", "attach", "update", "suspend", "resume", "nomorework", "allowmorework", "detach_when_done", "dont_detach_when_done", "get_init_status", "get_config", "create_account")**
    - **NOTE:** Currently, attaching a project using a file and the "create_account" method are not implemented.
  - options (object):
    - url **(string)**: The URL of the project to perform the action on
    - authenticator **(string)**: Only used for attaching. The user's (weak) account key for the project.
    - project_name **(string)**: Only used for attaching. Manually sets the name of the project to be attached.

- `getProxySettings()`: Returns the current proxy settings. *Response saved in `connection.responses.proxy`*


- `getAccountManager()`: Returns information regarding the currently configured account manager. *Response saved in `connection.responses.accountManager`*


- `setAccountManager()`: Various account manager operations.
  - action **(string, one of "attach", "detach", "update")**
	- **NOTE:** Currently, attaching/updating an account manager using a file is not implemented.
  - options **(object)**: Only used for attaching **and updating**.
	- url **(string)**: The URL of the account manager to perform the action on
	- name **(string)**: The user's username on the account manager.
	- password **(string)**: The user's password for the account manager.
