import { spawn, exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const envfile = require("envfile");

const execAsync = promisify(exec);

const NG_DIR = "/nextgraph-rs/target/release/";
/**
 * Orchestrates the initialization sequence:
 * 1. Run initial command and parse result
 * 2. Start a service and parse its output
 * 3. While service runs, execute a third command
 * 4. Stop the service
 * 5. Run final command
 */
async function initializeApp() {
  let firstNgdProcess = null;

  try {
    // Step 1: Run initial command and parse result
    // const { stdout: initialOutput } = await execAsync('echo "initial-data: key123"');
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
    console.log("Step 2: Starting service...");
    firstNgdProcess = await startNgdFirst(parsedAdminKey);
    const peerId = firstNgdProcess.jsonOutput.peerID; //TODO : Check the jsonOutput structure and get the peer id
    console.log("PeerId:", peerId);
    // console.log('jsonOutput:', firstNgdProcess);

    // Step 3: First run of NGD with the admin key, create the admin user
    console.log("Step 3: Creating the admin user...");
    const { stdout: createAdminUserOutput } = await execAsync(
      `${NG_DIR}ngcli --save-key -s 127.0.0.1,1440,${peerId} -u ${parsedAdminKey.private} admin add-user ${parsedAdminKey.public} -a`
    );
    console.log("Create admin user output:", createAdminUserOutput.trim());

    // Step 4: Stop the service
    console.log("Step 4: Stopping Ngd...");
    await stopService(firstNgdProcess);
    console.log("Service stopped");

    // // Step 5: Run final command
    // console.log('Step 5: Running final command...');
    // const { stdout: finalOutput } = await execAsync('echo "final-result"');
    // console.log('Final command output:', finalOutput.trim());

    // Step 5: Update .env file with parsed values
    console.log("Step 5: Updating .env file...");
    const envPath = path.join("/stack-root/ngScripts", ".env.sylvain"); // Adjust path as needed
    await updateEnvFile(envPath, {
      NG_ADMIN_USER_KEY: parsedAdminKey.private,
      NG_CLIENT_PEER_KEY: parsedClientPeerKey.private,
      NG_PEER_ID: peerId,
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
 * Update or create .env file with new values
 * Uses envfile library for proper .env file handling
 */
async function updateEnvFile(envPath, newValues) {
  let envVars = {};
  console.log("envPath:", envPath);
  console.log("newValues:", newValues);

  // Read existing .env file if it exists
  try {
    console.log("Reading .env file...");
    const content = await fs.readFile(envPath, "utf8");
    console.log("content:", content);
    envVars = envfile.parse(content);
  } catch (error) {
    console.log("File doesn't exist, that's okay - we'll create it");
    // File doesn't exist, that's okay - we'll create it
    if (error.code !== "ENOENT") {
      console.error("Error reading .env file:", error);
      // throw error;
    }
  }

  // Merge new values (new values override existing ones)
  envVars = { ...envVars, ...newValues };

  // Write back to file
  try {
    console.log("Writing .env file...");
    const content = envfile.stringify(envVars);
    await fs.writeFile(envPath, content, "utf8");
  } catch (error) {
    console.error("Error writing .env file:", error);
    // throw error;
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
    const process = spawn(
      NG_DIR + "ngd",
      [
        "-v",
        "-b",
        "./.ng.temp",
        "--json",
        "--save-key",
        "-l",
        "1440",
        "--admin",
        adminKey.public,
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

    // Collect stdout
    process.stdout.on("data", (data) => {
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

      process.stdout.write(text); // Also forward to console
    });

    // Collect stderr
    process.stderr.on("data", (data) => {
      const text = data.toString();
      console.log("stderr:", text);
      errorOutput += text;
      process.stderr.write(text);
    });

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

        resolve({ process, startupOutput, errorOutput, jsonOutput });
      }
    }, 100);

    // Handle process errors
    process.on("error", (error) => {
      clearInterval(readyCheck);
      reject(error);
    });

    // Timeout if service doesn't start
    setTimeout(() => {
      if (
        process.killed === false &&
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
function stopService({ process }) {
  return new Promise((resolve) => {
    resolve("test");
    // Try graceful shutdown first
    process.kill("SIGTERM");

    // Wait for process to exit
    process.on("exit", (code) => {
      console.log(`Service exited with code ${code}`);
      resolve();
    });

    // Force kill if it doesn't exit gracefully
    setTimeout(() => {
      if (!process.killed) {
        console.log("Force killing service...");
        process.kill("SIGKILL");
        resolve();
      }
    }, 5000); // 5 second grace period
  });
}

// Run the initialization
initializeApp();
