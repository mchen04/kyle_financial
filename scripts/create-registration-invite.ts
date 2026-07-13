import { z } from "zod";
import { createRegistrationInvite } from "../src/server/auth/registration-invite";

const emailArgument = process.argv.slice(2).find((value) => value !== "--");
const email = z.email().parse(emailArgument?.trim().toLowerCase());
console.log(createRegistrationInvite(process.env.REGISTRATION_SECRET, email));
