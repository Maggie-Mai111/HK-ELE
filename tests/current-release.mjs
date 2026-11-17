import {readFileSync} from "node:fs";
export const CURRENT_RELEASE_VERSION = JSON.parse(readFileSync(new URL("../full_database_workbook.json",import.meta.url),"utf8")).dataVersion;
