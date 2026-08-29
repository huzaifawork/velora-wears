import { Link } from "react-router-dom";

import { buttonClasses } from "@admin/components/ui/Button";
import { EmptyState } from "@admin/components/ui/Skeleton";
import { SearchIcon } from "@admin/components/ui/Icons";
import { DASHBOARD } from "@admin/lib/routes";

/** An address in the dashboard that does not exist. */
export function NotFoundPage() {
  return (
    <EmptyState
      icon={<SearchIcon />}
      title="That screen does not exist"
      description="The link may be out of date, or the record it pointed at may have been deleted."
      action={
        <Link to={DASHBOARD} className={buttonClasses({ size: "sm" })}>
          Back to the dashboard
        </Link>
      }
      className="min-h-[50vh]"
    />
  );
}
