import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <span className="brand-dot" />
          SpinRead
        </Link>
        <div className="topbar-right">
          {user?.role === "COACH" && <><Link to="/coach">教练工作台</Link><Link to="/library">我的视频</Link></>}
          <Link to="/training">训练计划</Link>
          <Link to="/coaching">教练协作</Link>
          <Link to="/practice">接发球练习</Link>
          {user && <span className="topbar-user">{user.display_name || user.email}</span>}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            退出登录
          </button>
        </div>
      </div>
    </header>
  );
}
