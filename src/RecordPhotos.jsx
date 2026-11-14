import { useEffect, useState } from "react";
import { recordPhotoUrl, recordPhotosOf } from "./monkeyData";
import { IssuePhotos } from "./MaintenanceIssues";

// A record's photos (added with a new Injury, Injury Update, Condition or
// record: supabase/record-photos.sql), small; tap one to enlarge it. Nothing
// while it has none.
//   kind: "injury", "injury_update", "condition" or "record"
export default function RecordPhotos({ kind, recordId }) {
    const [paths, setPaths] = useState([]);
    useEffect(() => {
        if (recordId == null) return;
        let cancelled = false;
        recordPhotosOf(kind, recordId).then((found) => !cancelled && setPaths(found));
        return () => {
            cancelled = true;
        };
    }, [kind, recordId]);
    if (!paths.length) return null;
    return <IssuePhotos paths={paths} urlOf={recordPhotoUrl} />;
}
