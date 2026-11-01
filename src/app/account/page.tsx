import { redirect } from "next/navigation";

/**
 * The account screen of the old private pilot. There are no accounts any more (requirement 1.3): the address only
 * leads to the workspace. The query is not carried over.
 */
export default function AccountPage(): never {
  redirect("/app");
}
