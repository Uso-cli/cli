const shell = require('shelljs');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, spinner } = require('../utils/logger');

const create = async (projectName, options) => {
    // 1. Validation
    if (!projectName) {
        log.error("❌ Please specify a project name.");
        log.warn("👉 Usage: uso create <project-name>");
        return;
    }

    if (fs.existsSync(projectName)) {
        log.error(`❌ Directory '${projectName}' already exists.`);
        return;
    }

    log.header(`🏗️  Scaffolding new Solana project: ${projectName}...`);

    // 2. Locate Template
    // We expect templates/default relative to this file
    // src/commands/create.js -> templates/default is two levels up -> templates/default
    const templatePath = path.resolve(__dirname, '../../templates/default');
    if (!fs.existsSync(templatePath)) {
        log.error(`❌ Template not found at: ${templatePath}`);
        log.error("This installation of uso might be corrupted.");
        return;
    }

    // 3. Create Project Directory & Copy Files
    const projectPath = path.join(process.cwd(), projectName);
    shell.mkdir('-p', projectPath);

    const copySpin = spinner(`Copying template files...`).start();

    // Iterate and copy to avoid glob issues on Windows
    try {
        const files = fs.readdirSync(templatePath);
        for (const file of files) {
            const src = path.join(templatePath, file);
            const dest = path.join(projectPath, file);

            // Handle special dotfiles
            if (file === '_gitignore') {
                shell.cp(src, path.join(projectPath, '.gitignore'));
            } else if (file === '_prettierignore') {
                shell.cp(src, path.join(projectPath, '.prettierignore'));
            } else {
                shell.cp('-R', src, dest);
            }
        }
    } catch (e) {
        copySpin.fail(`Failed to copy templates from ${templatePath}`);
        log.error(e.message);
        return;
    }

    copySpin.succeed("Template files copied.");

    shell.cd(projectPath);

    // 4. Customization: Rename Project & Generate Program ID
    const configSpin = spinner(`Configuring project...`).start();

    // 4a. Program Keypair & ID
    // Create 'target/deploy' folder where keypair usually lives
    const deployDir = path.join(projectPath, 'target', 'deploy');
    shell.mkdir('-p', deployDir);

    // Check if user has solana-keygen
    let programId = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"; // Default fallback
    if (shell.which('solana-keygen')) {
        const keypairFile = path.join(deployDir, `${projectName}-keypair.json`);
        // Generate new keypair
        const result = shell.exec(`solana-keygen new --no-bip39-passphrase --outfile "${keypairFile}"`, { silent: true });
        if (result.code === 0) {
            // Extract pubkey
            const pubkey = shell.exec(`solana-keygen pubkey "${keypairFile}"`, { silent: true }).stdout.trim();
            if (pubkey) programId = pubkey;
        }
    }

    // 4b. Rename Program Directory
    // Default template has programs/my-project
    const oldProgramDir = path.join(projectPath, 'programs', 'my-project');
    const newProgramDir = path.join(projectPath, 'programs', projectName);

    // Rust crate names usually use underscores instead of dashes
    // e.g. project-name -> project_name
    const crateName = projectName.replace(/-/g, '_');
    const newProgramDirCrate = path.join(projectPath, 'programs', crateName);

    if (fs.existsSync(oldProgramDir)) {
        shell.mv(oldProgramDir, newProgramDirCrate);
    }

    // 4c. Update Cargo.toml (root and program)
    // Root Cargo.toml
    const rootCargoPath = path.join(projectPath, 'Cargo.toml');
    if (fs.existsSync(rootCargoPath)) {
        let content = fs.readFileSync(rootCargoPath, 'utf8');
        content = content.replace(/programs\/my-project/g, `programs/${crateName}`);
        fs.writeFileSync(rootCargoPath, content);
    }

    // Program Cargo.toml
    const programCargoPath = path.join(newProgramDirCrate, 'Cargo.toml');
    if (fs.existsSync(programCargoPath)) {
        let content = fs.readFileSync(programCargoPath, 'utf8');
        content = content.replace(/name = "my-project"/g, `name = "${crateName}"`);
        content = content.replace(/name = "my_project"/g, `name = "${crateName}"`);
        fs.writeFileSync(programCargoPath, content);
    }

    // 4d. Update Anchor.toml
    const anchorTomlPath = path.join(projectPath, 'Anchor.toml');
    if (fs.existsSync(anchorTomlPath)) {
        let content = fs.readFileSync(anchorTomlPath, 'utf8');
        // Replace Program ID
        content = content.replace(/my_project = ".*"/g, `${crateName} = "${programId}"`);
        // Replace scripts if needed (template might have default)
        fs.writeFileSync(anchorTomlPath, content);
    }

    // 4e. Update lib.rs with new Program ID
    const libRsPath = path.join(newProgramDirCrate, 'src', 'lib.rs');
    if (fs.existsSync(libRsPath)) {
        let content = fs.readFileSync(libRsPath, 'utf8');
        // declare_id!("...")
        content = content.replace(/declare_id!\(".*"\);/g, `declare_id!("${programId}");`);
        fs.writeFileSync(libRsPath, content);
    }

    // 4f. Update Tests
    // tests/my-project.ts -> tests/<projectName>.ts
    const oldTestFile = path.join(projectPath, 'tests', 'my-project.ts');
    const newTestFile = path.join(projectPath, 'tests', `${projectName}.ts`);
    if (fs.existsSync(oldTestFile)) {
        shell.mv(oldTestFile, newTestFile);
        // Build needs to reference this? No, anchor test runs all .ts files usually.
        // Update content of test file
        let content = fs.readFileSync(newTestFile, 'utf8');
        content = content.replace(/anchor\.workspace\.MyProject/g, `anchor.workspace.${toPascalCase(crateName)}`);
        fs.writeFileSync(newTestFile, content);
    }

    configSpin.succeed("Project configured.");

    // 5. Initialize Git
    if (shell.which('git')) {
        shell.exec('git init', { silent: true });
        shell.exec('git add .', { silent: true });
        shell.exec('git commit -m "Initial commit by uso"', { silent: true });
    }

    // 6. Inject Frontend Template
    const frontendRepo = "https://github.com/solana-developers/solana-dapp-next.git";
    log.info("🧬 Injecting Next.js frontend (Solana Adapter + Tailwind)...");

    const cloneSpin = spinner("Cloning frontend template...").start();
    if (shell.exec(`git clone ${frontendRepo} app`).code !== 0) {
        cloneSpin.fail("Failed to clone frontend template.");
        log.warn("⚠️  Proceeding without frontend.");
    } else {
        cloneSpin.succeed("Frontend template injected into ./app");
        // Remove .git from the frontend so it's part of the main repo
        // Robust removal for EBUSY
        try {
            const gitDir = path.join('app', '.git');
            if (fs.existsSync(gitDir)) {
                // Retry loop for Windows file locking
                let retries = 5;
                while (retries > 0) {
                    try {
                        shell.rm('-rf', gitDir);
                        if (!fs.existsSync(gitDir)) break;
                    } catch (e) { /* ignore errors during retry */ }
                    retries--;
                    if (retries > 0) shell.exec('powershell -Command "Start-Sleep -Milliseconds 500"');
                }
                // If shelljs fails, try node fs
                if (fs.existsSync(gitDir)) {
                    fs.rmSync(gitDir, { recursive: true, force: true });
                }
            }
        } catch (e) {
            log.warn("⚠️  Could not fully remove app/.git (EBUSY). You may delete it manually.");
        }
    }

    // 7. Install Dependencies (Optional but nice)
    // Skipping to keep it fast, user can run npm install

    // 8. Final Success Message
    console.log("");
    log.header(`✅ Project '${projectName}' is ready! 🚀`);
    log.info(`   Program ID: ${programId}`);

    log.subHeader("Quick Start:");
    console.log(chalk.yellow(`  cd ${projectName}`));
    console.log(chalk.yellow(`  uso val     `) + chalk.gray(" # Start local validator (in new terminal)"));
    // We should probably run npm install for them?
    console.log(chalk.yellow(`  npm install `) + chalk.gray(" # Install dependencies"));
    console.log(chalk.yellow(`  uso test    `) + chalk.gray(" # Build & run tests"));
    console.log("");

    log.subHeader("Frontend:");
    console.log(chalk.yellow(`  cd app`));
    console.log(chalk.yellow(`  npm install`));
    console.log(chalk.yellow(`  npm run dev`));
    console.log("");
};

// Helper: snake_case to PascalCase
function toPascalCase(str) {
    return str.replace(/(\w)(\w*)/g,
        function (g0, g1, g2) { return g1.toUpperCase() + g2.toLowerCase(); }).replace(/_/g, '');
}

module.exports = { create };
