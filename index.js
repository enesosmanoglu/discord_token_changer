const fs = require('fs');
const path = require('path');
const { exec, } = require("child_process");
const level = require('level');
const psList = require('ps-list');

let localAppDataPath = process.env.LOCALAPPDATA || (process.platform == 'darwin' ? '/Library/Application Support' : "/usr/bin/");
let appDataPath = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");

/** @type {'Discord'|'DiscordPTB'|'DiscordCanary'|'DiscordDevelopment'} */
let _type = 'Discord';
let db = {
    keyPrefix: '',
    valuePrefix: '',
    get path() {
        return path.join(appDataPath, _type.toLowerCase(), 'Local Storage', 'leveldb');
    },
    get type() {
        return _type;
    },
    set type(newType) {
        if (newType == 'DiscordPTB' || newType == 'DiscordCanary' || newType == 'DiscordDevelopment') {
            _type = newType;
        } else {
            _type = 'Discord';
        }
    },
}

/** @param {'Discord'|'DiscordPTB'|'DiscordCanary'|'DiscordDevelopment'} newType */
function changeDiscordType(newType) {
    db.type = newType;
    return db.type;
}

async function getDiscordProcess() {
    let tasklist = await psList();
    //=> [{pid: 3213, name: 'node', cmd: 'node test.js', ppid: 1, uid: 501, cpu: 0.1, memory: 1.5}, …]
    let dclist = tasklist.filter(t => t.name == (db.type + ".exe"));
    return dclist;
}
async function isDiscordOpen() {
    let dclist = await getDiscordProcess();
    return dclist.length > 0;
}
async function checkIsDiscordOpen(retry = 3) {
    return new Promise(async (resolve, reject) => {
        if (!(await isDiscordOpen())) {
            if (retry) {
                setTimeout(async () => {
                    resolve(await checkIsDiscordOpen(--retry))
                }, 2000);
            } else {
                resolve(false);
            }
        } else {
            resolve(true);
        }
    })
}
function startDiscord() {
    console.error("Starting Discord app.");
    return new Promise(async (resolve, reject) => {
        exec(path.join(localAppDataPath, db.type, 'Update.exe') + ' --processStart ' + db.type + '.exe', (err, out, code) => {
            if (err)
                return reject(err);

            setTimeout(async () => {
                resolve(await checkIsDiscordOpen())
            }, 2000);
        });
    })
}
function stopDiscord() {
    console.error("Stopping", db.type, "app.");
    return new Promise(async (resolve, reject) => {
        let dclist = await getDiscordProcess();
        let res = [];
        for (let i = 0; i < dclist.length; i++) {
            const dc = dclist[i];
            try {
                process.kill(dc.pid, "SIGKILL");
                res.push(true);
            } catch (error) {
                res.push(false);
            }
        }
        console.log(res.includes(true) ? "Closed." : "Couldn't closed. / Already closed.")
        resolve(res.includes(true))
    })
}
function changeToken(token) {
    return new Promise((resolve, reject) => {
        if (!token || token.length < 59)
            return reject("Please insert a valid token!")

        level(db.path, {}, async (err, db) => {
            if (err) {
                if (err.message.startsWith("IO error: LockFile")) {
                    await stopDiscord()
                    resolve(await changeToken(token));
                    return;
                } else {
                    console.error(err.message);
                    reject(err);
                    return;
                }
            }

            db.createReadStream()
                .on('data', function (data) {
                    if (data.key.endsWith("notifications") && data.key.includes("discord.com")) {
                        db.keyPrefix = data.key.replace("notifications", "");
                        db.valuePrefix = data.value.split('{')[0];
                    }
                })
                .on('error', function (err) {
                    //console.log('Oh my!', err)
                    reject(err);
                })
                .on('end', async function () {
                    console.log("-----------------")
                    console.log("key:")
                    console.log(db.keyPrefix)
                    console.log("\nvalue:")
                    console.log(db.valuePrefix)
                    console.log("-----------------")
                    if (!db.keyPrefix || !db.valuePrefix) {
                        console.log("Restarting", db.type, "app.")
                        await startDiscord();
                        await stopDiscord();
                    }

                    getToken();

                    function getToken() {
                        db.get(db.keyPrefix + 'token', async function (err, value) {
                            if (err) {
                                if (err.message.includes("Key not found")) {
                                    console.log("No token found! Inserting new one.")
                                    dbSet("token", `"${token}"`)
                                } else {
                                    //console.log('Ooops!', err.message) // likely the key was not found
                                    reject(err);
                                }
                                return
                            }
                            value = value.replace(db.valuePrefix, "").replace(/"/g, "");

                            // Ta da!
                            //console.log('TOKEN FOUND!');
                            console.log('Current token:', value);
                            fs.writeFileSync("last", value, "utf8");

                            if (value != token) {
                                console.log("Changing token...")
                                dbSet("token", `"${token}"`)
                            }
                            else {
                                console.log("Didn't change - Same token found!")
                                db.close().then(async () => {
                                    if (db.isClosed()) {
                                        await startDiscord();
                                        resolve(true);
                                    } else {
                                        reject("Database couldn't closed. Please try again...")
                                    }
                                }).catch(reject)
                            }
                        })
                    }
                })

            function dbSet(key, value) {
                db.put(db.keyPrefix + key, db.valuePrefix + value, function (err) {
                    if (err) {
                        //console.log('Ooops!', err.message) // some kind of I/O error;
                        reject(err);
                        return;
                    }
                    db.get(db.keyPrefix + key, function (err, valueN) {
                        if (err) {
                            //console.log('Ooops!', err.message) // likely the key was not found
                            reject(err);
                            return;
                        }

                        valueN = valueN.replace(db.valuePrefix, "");

                        // Ta da!
                        console.log(valueN == value ? "[OK]" : "[FAIL]", key, '=', value)

                        db.close().then(async () => {
                            if (db.isClosed()) {
                                await startDiscord();
                                resolve(valueN == value);
                            } else {
                                reject("Database couldn't closed. Please try again...")
                            }
                        }).catch(reject)

                    })
                })
            }
        })
    })
}

module.exports = {
    changeDiscordType,
    getDiscordProcess,
    isDiscordOpen,
    checkIsDiscordOpen,
    startDiscord,
    stopDiscord,
    changeToken,
}