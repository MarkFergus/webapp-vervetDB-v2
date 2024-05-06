import { Component } from "react";
import { IconBrandDatabricks } from "@tabler/icons-react";
import "./Nav.css";

class Nav extends Component {
    render() {
        return (
            <nav className="Nav">
                <div className="Nav-icon">
                    <IconBrandDatabricks stroke={1.5} />
                </div>
                <p>vervetDB</p>
                <button>Sign In</button>
            </nav>
        );
    }
}

export default Nav;
