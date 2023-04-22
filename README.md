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

let connection = new RPC('127.0.0.1', 31416, 'password');

connection.on('ready', () => {
	// Your code!
})
```

## Currently implemented methods:
 - `getState()`: Returns the current client state. **Note: This is currently being run automatically when the connection is established.**

- `getWU(activeOnly)`: Returns current workunits
	- activeOnly (boolean): Only return currently active workunits

- `getStatus()`: Returns current client status (execution modes, suspension reasons, etc)

- `getStatistics()`: Returns available statistics per project 

- `getWUHistory()`: Returns old tasks **Note: (it is not specified by the BOINC documentation how far back the task history spans!)**

- `getDiskUsage()`: Returns total and per project disk usage

- `getServerVersion()`: Returns the BOINC client version

- `getMessageCount()`: Returns the number of messages in the log

- `getMessages(seqno, translatable)`: Returns messages from the log
	- seqno (optional, int): Start messages from this sequence number
	- translatable (optional, boolean, default: false)