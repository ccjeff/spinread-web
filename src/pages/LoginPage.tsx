import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

export default function LoginPage() {
  const { token, login, register } = useAuth();
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"USER" | "COACH">("USER");
  const [email, setEmail] = useState("demo@spinread.local");
  const [password, setPassword] = useState("spinread-demo");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (registering) await register(email.trim(), password, displayName.trim(), role);
      else await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("账号或密码错误");
      } else {
        setError(err instanceof Error ? err.message : "登录失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => void onSubmit(e)}>
        <h1 className="login-title">SpinRead</h1>
        <p className="login-subtitle">球员、AI 与教练一起完成训练复盘</p>
        {registering && <><label className="field"><span>显示名称</span><input required maxLength={80} value={displayName} onChange={e => setDisplayName(e.target.value)}/></label><label className="field"><span>使用身份</span><select value={role} onChange={e => setRole(e.target.value as "USER" | "COACH")}><option value="USER">球员</option><option value="COACH">教练</option></select></label><p className="muted">教练身份不自动获得视频访问权；球员需逐个授权。</p></>}
        <label className="field">
          <span>邮箱</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={registering ? 8 : undefined}
            maxLength={128}
            autoComplete={registering ? "new-password" : "current-password"}
          />
        </label>
        {error && <div className="banner banner-error">{error}</div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? "处理中…" : registering ? "注册并进入" : "登录"}
        </button>
        <button type="button" className="btn btn-ghost btn-block" disabled={submitting} onClick={() => {setRegistering(!registering); setEmail(""); setPassword(""); setError(null);}}>{registering ? "已有账号，返回登录" : "创建球员 / 教练账号"}</button>
      </form>
    </div>
  );
}
