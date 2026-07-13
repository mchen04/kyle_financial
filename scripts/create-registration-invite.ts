import { createRegistrationInvite } from "../src/server/auth/registration-invite";

console.log(createRegistrationInvite(process.env.REGISTRATION_SECRET));
