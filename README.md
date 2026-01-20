# Nextgraph Docker image to be used as a triplestore in semapps applications

## What did we do ?

We created a docker file that :
1. Installs all necessary dependencies
2. Build nextrgraph (ngd and ngcli)
3. Builds the sdk for javascript
4. Has the ability to initialize without creating a wallet

For now the goal is only to be able to use nextgraph as a triplestore, but it may evolve in the future

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
    restart: always
    volumes:
      - ./data/ng:/nextgraph-rs/.ng:z
      - .env:/stack-root/.env:z # In order to be able to update the .env file during the initialization of nextgraph
    ports:
      - '1440:1440'
    expose:
      - '1440'
```

### What happens ?

The entry point of the Docker image is a script that looks for existence of the data folder of nextgraph, specifically the server/key file.

- If present, it considers the server intialized and launches ngd.
- If not, it launches the init process (initNg.js) then launches ngd

### The INIT process

 1. Generate the keys for the admin user and the client peer
 2. Run ngd for the first time, with the admin key
 3. Create the admin user with ngcli
 4. Create the user and the document for the mappings
 5. Stop ngd
 6. Update the .env file with values

 ## Issue with accessing ngd from outside the container

### Context
Ngd is listening on loopback and eth0 :
```bash 
2026-01-20 20:59:50 Key file found at /nextgraph-rs/.ng/server/key. Launching ngd...
2026-01-20 20:59:50 [2026-01-20T19:59:50Z INFO  ng_storage_rocksdb::kcv_storage] created kcv storage with Rocksdb Version: 8.6.0
2026-01-20 20:59:50 [2026-01-20T19:59:50Z INFO  ng_broker::server_ws] Listening on lo 127.0.0.1:1440, [::1]:1440
2026-01-20 20:59:50 [2026-01-20T19:59:50Z INFO  ng_broker::server_ws] Listening on eth0 172.21.0.2:1440
```

### The test 

From a terminal in, the container, use ngcli to access the server through the loopback interface :
```
root@d6eff07722db:/nextgraph-rs# target/release/ngcli --save-key -v -s 127.0.0.1,1440,<peer id of ngd> -u <private key of the admin user> admin list-users
Found 2 users
ftg7uemjIcl1SBgE7HFRtlW9NelbKNSvrsobk_5RsD4A
ftg7uemjIcl1SBgE7HFRtlW9NelbKNSvrsobk_5RsD4A
root@d6eff07722db:/nextgraph-rs# 
```

Same thing from a terminal in the host machine, with ngcli built from the same commit : 

```
sylvain@UP222:~/NG/nextgraph-rs-docker-test$ target/release/ngcli --save-key -v -s 127.0.0.1,1440,<peer id of ngd> -u <private key of the admin user> admin list-users
[2026-01-20T19:07:18Z ERROR ngcli] An error occurred: ConnectionError
Error: Custom { kind: Other, error: "ProtocolError:ConnectionError" }
sylvain@UP222:~/NG/nextgraph-rs-docker-test$
```

Nothing happens in the console output of ngd...
