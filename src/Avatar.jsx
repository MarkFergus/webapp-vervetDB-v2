import { IconUser } from "@tabler/icons-react";
import "./Avatar.css";

// An account's picture: their photo (see accountPhoto.js), or the person icon
// until there is one. Goes inside a round frame (the account pop-up, the
// top bar and the bottom bar), which keeps its green ring.
function Avatar({ url, size }) {
    return url ? <img className="Avatar-photo" src={url} alt="" /> : <IconUser stroke={1.75} size={size} />;
}

export default Avatar;
