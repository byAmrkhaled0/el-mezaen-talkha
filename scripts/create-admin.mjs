import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true] : null).filter(Boolean));
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
const role = args.role || "admin";
if (!projectId || (!args.uid && !args.email) || !["admin", "manager", "receptionist", "accountant"].includes(role)) throw new Error("Usage: FIREBASE_PROJECT_ID=... npm run create-admin -- --email owner@example.com --role admin");
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = args.uid ? await auth.getUser(args.uid) : await auth.getUserByEmail(args.email);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role });
await getFirestore().doc(`users/${user.uid}`).set({ email: user.email || args.email || "", role, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`Role ${role} assigned to ${user.email || user.uid}. No password was read or stored by this script.`);
