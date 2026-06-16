import { signToken } from "../apps/web/lib/auth";
const secret = "a_very_long_and_secure_random_string_for_signing_cookies_1234567890";

async function main() {
  const token = await signToken({ username: "admin", exp: Date.now() + 24 * 60 * 60 * 1000 }, secret);
  console.log("TOKEN:", token);
}

main().catch(console.error);
