import { reissueTenantSecretFromCli } from "./reissue.js";
import { provisionTenantFromCli } from "./provision.js";

const command = process.argv[2];

if (command === "reissue") {
  await reissueTenantSecretFromCli(process.argv.slice(2));
} else if (command === "provision") {
  await provisionTenantFromCli(process.argv.slice(2));
} else {
  console.error("Usage: felixos-cli <command> [args]");
  console.error("Commands:");
  console.error("  provision --tenant <tenant-slug> --name <tenant-name>");
  console.error("  reissue --tenant <tenant-slug>");
  process.exit(1);
}

export { reissueTenantSecretFromCli, provisionTenantFromCli };
