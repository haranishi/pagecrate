import { redirect } from "next/navigation";

/**
 * The sign-in screen of the old private pilot. Nothing needs signing in any more (requirement 1.3): the address only
 * leads to the workspace. The query (for example ?error=oauth) is not carried over.
 */
export default function LoginPage(): never {
  redirect("/app");
}
