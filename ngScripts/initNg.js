import { spawn, exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import ng from "lib-wasm";

const execAsync = promisify(exec);

const NG_DIR = "/nextgraph-rs/target/release/";
const ENV_PATH = "/stack-root/.env";

/**
 * Orchestrates the initialization sequence of nextgraph:
 * 1. Generate the keys for the admin user and the client peer
 * 2. Run NGD for the first time, with the admin key
 * 3. Create the admin user
 * 4. Create the user and the document for the mappings
 * 5. Stop the service
 * 6. Update the .env file with values
 */
async function initializeNg() {
  let firstNgdProcess = null;

  try {
    // Step 1: Generate the keys for the admin user and the client peer
    console.log("Step 1: Generating keys...");
    console.log("   -> For the admin user");
    const { stdout: genAdminKeyOutput } = await execAsync(
      NG_DIR + "ngcli gen-key --json"
    );

    const parsedAdminKey = parseGenKey(genAdminKeyOutput);
    console.log(parsedAdminKey);

    console.log("   -> For the client peer");
    const { stdout: genClientPeerKeyOutput } = await execAsync(
      NG_DIR + "ngcli gen-key --json"
    );
    const parsedClientPeerKey = parseGenKey(genClientPeerKeyOutput);
    console.log(parsedClientPeerKey);

    // Step 2: Start service and parse output
    console.log("Step 2: Starting ngd first instance...");
    firstNgdProcess = await startNgdFirst(parsedAdminKey);
    const peerId = firstNgdProcess.jsonOutput.peerID; //TODO : Check the jsonOutput structure and get the peer id
    console.log("PeerId:", peerId);

    // Step 3: create the admin user
    console.log("Step 3: Creating the admin user...");
    const { stdout: createAdminUserOutput } = await execAsync(
      `${NG_DIR}ngcli --save-key -s 127.0.0.1,1440,${peerId} -u ${parsedAdminKey.private} admin add-user ${parsedAdminKey.public} -a`
    );
    console.log("Create admin user output:", createAdminUserOutput.trim());

    // Step 4: create the user and the document for the mappings
    console.log("Step 4: Creating the user and the document for the mappings...");
    const {mappingsNuri, userId} = await createUserAndDocument(parsedAdminKey, parsedClientPeerKey, peerId);
    
    // Step 5: Stop the service
    console.log("Step 4: Stopping Ngd...");
    await stopService(firstNgdProcess);
    console.log("Service stopped");

    // Step 6: Update .env file with parsed values
    console.log("Step 5: Updating .env file...");
    await updateEnvFile(ENV_PATH, {
      NG_ADMIN_USER_KEY: parsedAdminKey.private,
      NG_CLIENT_PEER_KEY: parsedClientPeerKey.private,
      NG_PEER_ID: peerId,
      NG_MAPPINGS_NURI: mappingsNuri,
      NG_MAPPINGS_USER_ID: userId,
    });
    console.log(".env file updated successfully");

    console.log("Initialization complete!");
    process.exit(0);
  } catch (error) {
    console.error("Error during initialization:", error);

    // Cleanup: ensure service is stopped on error
    if (firstNgdProcess) {
      await stopService(firstNgdProcess).catch(() => {});
    }

    process.exit(1);
  }
}

/**
 * Create the user and the document for the mappings
 */
async function createUserAndDocument(adminKey, clientPeerKey, peerId) {
  console.log("Creating the user and the document for the mappings...");
  let config = {
    server_peer_id: peerId,
    admin_user_key: adminKey.private,
    client_peer_key: clientPeerKey.private,
    server_addr: "127.0.0.1:1440",
  };
  
  await ng.init_headless(config)
  let session_id;
  try {
    let userId = await ng.admin_create_user(config);
    console.log("Mappings user created: ", userId);

    let session = await ng.session_headless_start(userId);
    session_id = session.session_id;
    console.log(session);

    let protected_repo_id = session.protected_store_id.substring(2, 46);
    console.log("Session started. protected store ID = ", protected_repo_id);
    let mappingsNuri = await ng.doc_create(
      session_id,
      "Graph",
      "data:graph",
      "store",
      "protected",
      protected_repo_id
    );
    console.log("Mappings document created with nuri:", mappingsNuri);
    await ng.session_headless_stop(session_id, true)
    return {mappingsNuri: mappingsNuri, userId: userId};
  } catch (e) {
    console.error(e);
    if (session_id) await ng.session_headless_stop(session_id, true);
  }  
}

/**
 * Update or create .env file with new values
 * Uses envfile library for proper .env file handling
 */
async function updateEnvFile(envPath, newValues) {

  let content = "";
  // Read existing .env file if it exists
  try {
    console.log("Reading .env file...");
    content = await fs.readFile(envPath, "utf8");
    console.log("content of the .env file before update:", content);

  } catch (error) {
    console.log("File doesn't exist, that's okay - we'll create it");
    // File doesn't exist, that's okay - we'll create it
    if (error.code !== "ENOENT") {
      console.error("Error reading .env file:", error);
      throw error;
    }
  }

  // Merge new values (new values override existing ones)
  //iterate over the new values and update the content
  Object.entries(newValues).forEach(([key, value]) => {
    const lineRegex = new RegExp(`^\\s*${key}=.*$`, "m");
    //does the line exist in the content ?
    if (lineRegex.test(content)) {
      content = content.replace(lineRegex, `${key}=${value}`);
    } else {
      // If not, add the line to the end of the file
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
  });

  // Write back to file
  try {
    console.log("Writing .env file...");
    // const content = stringify(envVars);
    console.log("Updated content:", content);
    await fs.writeFile(envPath, content, "utf8");
    console.log("File written successfully");
  } catch (error) {
    console.error("Error writing .env file:", error);
    throw error;
  }
}

/**
 * Parse output from initial command
 */
function parseGenKey(output) {
  return JSON.parse(output);
}

/**
 * Start ngd first instance and return the process
 */
function startNgdFirst(adminKey) {
  return new Promise((resolve, reject) => {
    console.log("Starting ngd first instance...");
    const childProcess = spawn(
      NG_DIR + "ngd",
      [
        "-v", // verbose mode
        "-b", // use a given base directory
        "/nextgraph-rs/.ng", // path to the .ng folder
        "--json", // output in json format
        "--save-key", // save the key to the .ng folder
        "-l", // listen on loopback address
        "1440", // port
        "--admin", // use a given admin key
        adminKey.public, // admin key
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      }
    );

    let startupOutput = "";
    let errorOutput = "";
    let jsonBuffer = "";
    let braceCount = 0;
    let jsonStarted = false;

    // Prevent unhandled errors
    const handleStreamError = (error) => {
      // Ignore errors from closed streams
      if (error.code !== "ECONNRESET" && error.code !== "EPIPE") {
        console.warn("Stream error:", error.message);
      }
    };

    // Collect stdout
    childProcess.stdout.on("data", (data) => {
      console.log("stdout:", data.toString());
      const text = data.toString();
      startupOutput += text;

      // Better JSON detection: count braces
      for (const char of text) {
        if (char === "{") {
          if (!jsonStarted) {
            jsonStarted = true;
            jsonBuffer = "";
          }
          braceCount++;
          jsonBuffer += char;
        } else if (char === "}") {
          braceCount--;
          jsonBuffer += char;
          if (jsonStarted && braceCount === 0) {
            // Complete JSON object found
            jsonStarted = false;
          }
        } else if (jsonStarted) {
          jsonBuffer += char;
        }
      }

      childProcess.stdout.write(text); // Also forward to console
    });

    childProcess.stdout.on("error", handleStreamError);

    // Collect stderr (contains debug information cause the the json option masks them from stdout)
    childProcess.stderr.on("data", (data) => {
      const text = data.toString();
      console.log("Debug:", text);
      errorOutput += text;
      childProcess.stderr.write(text);
    });

    childProcess.stderr.on("error", handleStreamError);

    // Wait for service to be ready
    const readyCheck = setInterval(() => {
      if (errorOutput.includes("Listening on lo")) {
        clearInterval(readyCheck);
        console.log("Service is ready");

        // Parse JSON after service is ready
        let jsonOutput = {};
        try {
          if (jsonBuffer.trim()) {
            jsonOutput = JSON.parse(jsonBuffer);
          }
        } catch (parseError) {
          console.warn("Failed to parse JSON output:", parseError);
          // Try to extract JSON from full output as fallback
          const jsonMatch = startupOutput.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              jsonOutput = JSON.parse(jsonMatch[0]);
            } catch (e) {
              console.warn("Fallback JSON parsing also failed");
            }
          }
        }

        resolve({
          process: childProcess,
          startupOutput,
          errorOutput,
          jsonOutput,
        });
      }
    }, 100);

    // Handle process errors
    childProcess.on("error", (error) => {
      clearInterval(readyCheck);
      reject(error);
    });

    // Timeout if service doesn't start
    setTimeout(() => {
      if (
        childProcess.killed === false &&
        !errorOutput.includes("Listening on lo")
      ) {
        clearInterval(readyCheck);
        reject(new Error("Service failed to start within timeout"));
      }
    }, 30000);
  });
}


/**
 * Stop the service gracefully
 */
function stopService({ process: childProcess }) {
  return new Promise((resolve) => {
    // Clean up streams
    const cleanup = () => {
      if (childProcess.stdout) {
        childProcess.stdout.removeAllListeners();
        childProcess.stdout.destroy();
      }
      if (childProcess.stderr) {
        childProcess.stderr.removeAllListeners();
        childProcess.stderr.destroy();
      }
    };

    // Try graceful shutdown first
    childProcess.kill("SIGTERM");

    // Wait for process to exit
    childProcess.once("exit", (code) => {
      console.log(`Service exited with code ${code}`);
      cleanup();
      // Add a small delay to ensure streams are fully closed
      setTimeout(() => {
        resolve();
      }, 100);
    });

    // Force kill if it doesn't exit gracefully
    setTimeout(() => {
      if (!childProcess.killed) {
        console.log("Force killing service...");
        childProcess.kill("SIGKILL");
        resolve();
      }
    }, 5000); // 5 second grace period
  });
}

// Run the initialization
initializeNg();
