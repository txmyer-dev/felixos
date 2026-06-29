import { reissueTenantSecretFromCli } from "./reissue.js";

if (process.argv[2] === "reissue") {
  await reissueTenantSecretFromCli(process.argv.slice(2));
}

export { reissueTenantSecretFromCli };
