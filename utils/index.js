import fs from "fs";

import { execa } from "execa";
import pc from "picocolors";
import fetch from "node-fetch";

import { cac } from "cac";
// ES Module doesn't have require
import { require } from "./require.js";

const pkg = require("../package.json");
const cli = cac();

import { getCustomRegistry, addCustomRegistry, removeCustomRegistry } from "./registries.js";

// init default and custom registries
const defaultRegistries = require("../registries.json");
// init in main
let registries;

/**
 * generate equal width name with dashline
 * @param {string} str
 * @returns
 */
function dashline(str) {
  const maxCharWidth = Math.max(...Object.keys(registries).map((key) => key.length)) + 3;

  const line = new Array(Math.max(1, maxCharWidth - str.length)).join("-");
  return str + " " + line;
}

/**
 * Ensure suffix of a string
 * @param {string} suffix
 * @param {string} str
 */
function ensureSuffix(suffix, str) {
  if (!str.endsWith(suffix)) return str + suffix;
  return str;
}

/**
 * get default and custom registries
 * @returns
 */
async function getAllRegistries() {
  const customRegistries = await getCustomRegistry();
  return Object.assign({}, defaultRegistries, customRegistries);
}

/**
 * Show all npm registries
 */
export async function listRegistries(pkgManager = "npm") {
  let list = "";
  const currentRegistry = await getCurrentRegistry(pkgManager);

  let inList = false;

  Object.keys(registries).forEach((key) => {
    const isCurrentRegistry = key === currentRegistry;
    if (isCurrentRegistry) inList = true;
    const prefix = isCurrentRegistry ? "*" : " ";
    const item = `\n ${prefix} ${dashline(key)} ${registries[key].registry}`;
    list += isCurrentRegistry ? pc.green(item) : item;
  });
  if (!inList) console.log(`\n  ${pc.red("Unknown")} registry: ${pc.yellow(currentRegistry)}`);
  console.log(list + "\n");
  return list;
}

async function getCurrentRegistry(pkgManager = "npm") {
  let registry = "";
  try {
    const { stdout = "" } = await execa(pkgManager, ["config", "get", "registry"]);
    registry = stdout.trim();
  } catch {
    // for yarn v3
    const { stdout = "" } = await execa(pkgManager, ["config", "get", "npmRegistryServer"]);
    registry = stdout.trim();
  }

  for (const name in registries) {
    if (registries[name].registry === ensureSuffix("/", registry)) {
      return name;
    }
  }
  return registry;
}

/**
 * https://docs.npmjs.com/cli/v7/commands/npm-config
 * @param {string} name
 * @param {*} pkgManager
 * @returns
 */
export async function setCurrentRegistry(name, pkgManager = "npm") {
  await execa(pkgManager, ["config", "set", "registry", registries[name].registry]);
}

/**
 * delay time
 * @param {string} url
 */
async function getDelayTime(url) {
  const start = +new Date();
  return fetch(url)
    .then(() => {
      const time = new Date() - start;
      const msg = `${time} ms`;
      if (time < 500) {
        return pc.green(msg);
      } else if (time < 1000) {
        return pc.yellow(msg);
      } else {
        return pc.red(msg);
      }
    })
    .catch((e) => {
      return pc.red("Timeout");
    });
}

/**
 * list registries delay time
 * @returns
 */
export async function listDelayTime() {
  return await Promise.all(
    Object.keys(registries).map(async (key) => {
      const delayTime = await getDelayTime(registries[key].registry);
      const item = ` ${dashline(key)} ${delayTime}`;
      console.log(item);
    })
  );
}

/**
 * @param {string} pkgManager npm|yarn
 */
export async function main(pkgManager = "npm") {
  // init
  registries = await getAllRegistries();

  const onLs = async () => {
    await listRegistries(pkgManager);
  };
  cli.command("ls", "List all the registries").action(onLs);

  cli
    .command("use [registry]", "Change registry")
    .option("-l, --local", "set '.npmrc' for local")
    .action(async (registry, options) => {
      if (!registry) {
        console.log(`\n  nnrm use <registry>\n  Example: ${pc.yellow("nnrm use taobao")}\n`);
      } else {
        await setCurrentRegistry(registry, pkgManager);
        await listRegistries(pkgManager);
      }

      if (options.l || options.local) {
        const registryText = `registry=${registries[registry].registry}`;
        if (fs.existsSync(".npmrc")) {
          const content = fs.readFileSync(".npmrc", "utf-8");
          fs.writeFileSync(".npmrc", content.replace(/^registry=.*/gm, registryText));
        } else {
          fs.writeFileSync(".npmrc", registryText);
        }
      }
    });

  cli.command("test", "Show response time for all registries").action(async () => {
    console.log();
    await listDelayTime();
    console.log();
  });

  cli.command("add <registry> <url> [home]", "Add a custom registry").action(async (name, url, home) => {
    await addCustomRegistry(name, url, home);
    registries = await getAllRegistries();
    await listRegistries(pkgManager);
  });

  cli.command("remove <registry>", "Remove a custom registry").action(async (name) => {
    await removeCustomRegistry(name);
    registries = await getAllRegistries();
    await listRegistries(pkgManager);
  });

  cli.command("current", "Show current registry").action(async () => {
    console.log(await getCurrentRegistry(pkgManager));
  });

  cli.help();
  cli.version(pkg.version);
  cli.parse();
}
