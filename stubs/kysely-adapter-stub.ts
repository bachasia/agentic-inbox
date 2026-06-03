// Empty stub — @better-auth/kysely-adapter is not used in this project.
// The Bun SQLite dialect ships with a symbol removed from kysely 0.27+ which
// causes a build error in Cloudflare Workers.
const notAvailable = () => { throw new Error("kysely adapter is not available in Workers"); };
export default {};
export const BunSqliteDialect = class {};
export const MysqlDialect = class {};
export const PostgresDialect = class {};
export const createKyselyAdapter = notAvailable;
export const getKyselyDatabaseType = notAvailable;
export const kyselyAdapter = notAvailable;
