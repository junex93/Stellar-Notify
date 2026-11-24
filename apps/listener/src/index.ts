import { connect } from "./db/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

connect(databaseUrl);
console.log("notify listener: skeleton started (ingest not implemented)");
