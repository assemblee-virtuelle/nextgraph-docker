# nextgraph-docker

Welcome to the big mess !

## What to do if you want to run that stuff on you machine ?

Start by being very positive about life ^^

### Build the image

```
docker build -t nextgraph-rs:ubuntu -f ./Dockerfile.ubuntu .
```

### Run it

I'll just show a compose context here :

```yaml
services:
  ng_tests:
    image: nextgraph-rs:ubuntu
    container_name: ng_tests
    # uncomment the next line once ngd in properly initialized
    # command: ["/nextgraph-rs/target/release/ngd", "-v", "-p", "eth0:14400", "-l", "14400"]

    stdin_open: true
    tty: true
    restart: always
    volumes:
      - ./data/ng:/nextgraph-rs/.ng:z
      - .:z
    # network_mode: "host"
    ports:
      - "14400:14400/tcp"
    expose:
      - "14400/tcp"
```

### In the container

Open a shell in the container

```
docker exec -it ng_tests /bin/bash
```

Go in the ngScripts folder and install the dependencies and run the init script

```
cd /stack-root/ngScripts
npm install
node initNg.js
```

At this WIP stage the script launches ngd with a "-b ./ng.temp" option, that makes it so the server data aren't persistent in the container. That can be changed at lines 46-47 of the script.

You should get an output like this :

```
Step 1: Generating keys...
   -> For the admin user
(node:2914) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///stack-root/ngScripts/initNg.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /stack-root/ngScripts/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
{
  public: 'VR9bkGF0bwI4L-eZjGCgMWNY25EgAkAW3Rb7FC5_XxYA',
  private: 'MYN9ioLD8wOXiZ2vkWNoVoq_QIdIcRcmSz98Dwf3ZCIA'
}
   -> For the client peer
{
  public: '1hAaitnlcaYbJ4Q2_gIR-R-oxMC7ZYj_zQj4JSOMOmcA',
  private: '7ylLS4mJaUT7SacPfcVU7mL_4w4j4eA02opKWbqSiP0A'
}
Step 2: Starting service...
Starting ngd first instance...
stderr: [2026-01-15T22:06:57Z INFO  ngd] Starting NextGraph daemon (ngd) version 0.1.2

stderr: [2026-01-15T22:06:57Z INFO  ngd] PeerId of node: sQxVabYL8i2dbB6CDzSRW7BSwsmiaiyLQnpWaSjYliQA
[2026-01-15T22:06:57Z WARN  ngd] No key provided, generating one

stdout: {
"peerID":"sQxVabYL8i2dbB6CDzSRW7BSwsmiaiyLQnpWaSjYliQA"
}

stderr: [2026-01-15T22:06:57Z INFO  ngd] The key has been saved to /nextgraph-rs/./.ng.temp/server/key

stderr: [2026-01-15T22:06:57Z INFO  ng_storage_rocksdb::kcv_storage] created kcv storage with Rocksdb Version: 8.6.0

stderr: [2026-01-15T22:06:57Z INFO  ng_storage_rocksdb::kcv_storage] created kcv storage with Rocksdb Version: 8.6.0

stdout: The admin invitation link is: https://nextgraph.net/#/i/AAEAoAUAAQAkltgoaVZ6QossaqLJwlKwW5E0D4IebJ0t8gu2aVUMsQEAs7eNDcudQRwDW3N7-sy2Fb5Qq6oSKhFSBF8y_n3veqcBFXlvdXIgQnJva2VyLCBhcyBhZG1pbgA
The admin invitation link is: http://localhost:1440/#/i/AAEAoAUAAQAkltgoaVZ6QossaqLJwlKwW5E0D4IebJ0t8gu2aVUMsQEAs7eNDcudQRwDW3N7-sy2Fb5Qq6oSKhFSBF8y_n3veqcBFXlvdXIgQnJva2VyLCBhcyBhZG1pbgA

stderr: [2026-01-15T22:06:57Z INFO  ng_storage_rocksdb::kcv_storage] created kcv storage with Rocksdb Version: 8.6.0

stderr: [2026-01-15T22:06:57Z INFO  ng_storage_rocksdb::block_storage] created blockstorage with Rocksdb Version: 8.6.0

stderr: [2026-01-15T22:06:58Z INFO  ng_storage_rocksdb::kcv_storage] created kcv storage with Rocksdb Version: 8.6.0

stderr: [2026-01-15T22:06:58Z INFO  ng_broker::server_ws] Listening on lo 127.0.0.1:1440, [::1]:1440

Service is ready
PeerId: sQxVabYL8i2dbB6CDzSRW7BSwsmiaiyLQnpWaSjYliQA
Step 3: Creating the admin user...
Create admin user output: User added successfully
Step 4: Stopping Ngd...
Service stopped
Step 5: Updating .env file...
envPath: /stack-root/ngScripts/.env.sylvain
newValues: {
  NG_ADMIN_USER_KEY: 'MYN9ioLD8wOXiZ2vkWNoVoq_QIdIcRcmSz98Dwf3ZCIA',
  NG_CLIENT_PEER_KEY: '7ylLS4mJaUT7SacPfcVU7mL_4w4j4eA02opKWbqSiP0A',
  NG_PEER_ID: 'sQxVabYL8i2dbB6CDzSRW7BSwsmiaiyLQnpWaSjYliQA'
}
Reading .env file...
node:events:497
      throw er; // Unhandled 'error' event
      ^

Error: read ECONNRESET
    at Pipe.onStreamRead (node:internal/stream_base_commons:216:20)
Emitted 'error' event on Socket instance at:
    at emitErrorNT (node:internal/streams/destroy:170:8)
    at emitErrorCloseNT (node:internal/streams/destroy:129:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21) {
  errno: -104,
  code: 'ECONNRESET',
  syscall: 'read'
}

Node.js v22.21.1
```

The updating the .env part isn't working yet but the server is well initialized.

### And now, how do I actually use of the container ?

Well I'm reaaly happy you asked, cause I actually really don't know yet !
There is an issue integrating ng with docker, and I don't know yet what it is.
