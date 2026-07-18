# Security

## Report it privately

Open a private [GitHub Security Advisory](https://github.com/Ducheved/neko-lucia/security/advisories/new). Do not paste live tokens, hashes, database dumps, working exploits, or production details into a public issue.

If the private form is busted, contact [@Ducheved](https://github.com/Ducheved) without the technical payload and ask for a private channel.

Expect an initial reply within seven days. Fix timing depends on severity and whether the patch needs a safe database rollout. Details stay private until users have a workable upgrade path.

## Supported line

The newest published minor line gets security fixes. Vulnerable releases may be deprecated on npm. Repository snapshots between releases are unsupported.

## Sensitive data

Treat session tokens, cookie values, stored secret hashes, and every v1 session ID as sensitive. V2 database IDs are public identifiers, but mixed-version code should keep all session IDs out of logs anyway.

The core never stores a raw v2 token secret. Wrong-secret and token-version mismatches do not refresh, delete, or clean up a row. Expired and orphaned rows are removed only after the presented token authenticates.

Repository CI checks strict types, exact token grammar, cookie invariants, real database adapters, Node and Deno package consumers, dependency advisories, explicit `any`, committed secrets, and exact npm tarball contents.
