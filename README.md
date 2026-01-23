# Nextgraph Docker image to be used as a triplestore in SemApps applications

## What did we do ?

We created a docker file that :

1. Installs all necessary dependencies
2. Build nextgraph (ngd and ngcli)
3. Builds the sdk for javascript
4. Has the ability to initialize without creating a wallet

For now the goal is only to be able to use nextgraph as a triplestore, but it may evolve in the future

### Build the image

```
docker build -t semapps/nextgraph .
```

### Run it

I'll just show a compose context here :

```yaml
services:
  ng_tests:
    image: semapps/nextgraph
    container_name: ng_tests
    restart: always
    volumes:
      - ./data/ng:/nextgraph-rs/.ng:z
      - .env:/stack-root/.env:z # This file will be updated during initialization
    ports:
      - "14400:14400"
    expose:
      - "14400"
```

### What happens ?

The entry point of the Docker image is a script that looks for existence of the data folder of nextgraph, specifically the server/key file.

- If present, it considers the server initialized and launches ngd.
- If not, it launches the init process (initNg.js) then launches ngd

### The INIT process

1.  Generate the keys for the admin user and the client peer
2.  Run ngd for the first time, with the admin key
3.  Create the admin user with ngcli
4.  Create the user and the document for the mappings
5.  Stop ngd
6.  Update (or create) the .env file with values

### Test

If everything goes fine, you should see this output from the container logs:

```bash
2026-01-20 20:59:50 Key file found at /nextgraph-rs/.ng/server/key. Launching ngd...
2026-01-20 20:59:50 [2026-01-20T19:59:50Z INFO  ng_storage_rocksdb::kcv_storage] created kcv storage with Rocksdb Version: 8.6.0
2026-01-20 20:59:50 [2026-01-20T19:59:50Z INFO  ng_broker::server_ws] Listening on lo 127.0.0.1:14400, [::1]:14400
2026-01-20 20:59:50 [2026-01-20T19:59:50Z INFO  ng_broker::server_ws] Listening on eth0 172.21.0.2:14400
```

To use the NextGraph CLI, use the IP address of the Docker container (last line of the output above), as well as the `NG_SERVER_PEER_ID` and `NG_ADMIN_USER_KEY` values that can be found in the .env file.

```bash
target/release/ngcli --save-key -v -s 172.21.0.2,14400,<NG_SERVER_PEER_ID> -u <NG_ADMIN_USER_KEY> admin list-users
Found 2 users
ftg7uemjIcl1SBgE7HFRtlW9NelbKNSvrsobk_5RsD4A
ftg7uemjIcl1SBgE7HFRtlW9NelbKNSvrsobk_5RsD4A
```

### Publish the image

```
docker push semapps/nextgraph
```
