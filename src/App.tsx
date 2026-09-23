import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import LoginPage from "./pages/LoginPage";
import VideoListPage from "./pages/VideoListPage";
import UploadPage from "./pages/UploadPage";
import VideoDetailPage from "./pages/VideoDetailPage";

import TrainingPage from "./pages/TrainingPage";
import CoachingPage from "./pages/CoachingPage";
import ReviewPage from "./pages/ReviewPage";
import QuizManagePage from "./pages/QuizManagePage";
import QuizPracticePage from "./pages/QuizPracticePage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <VideoListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/upload"
            element={
              <RequireAuth>
                <UploadPage />
              </RequireAuth>
            }
          />
          <Route
            path="/videos/:id"
            element={
              <RequireAuth>
                <VideoDetailPage />
              </RequireAuth>
            }
          />
          <Route path="/videos/:id/quizzes" element={<RequireAuth><QuizManagePage /></RequireAuth>} />
          <Route path="/practice" element={<RequireAuth><QuizPracticePage /></RequireAuth>} />
          <Route path="/training" element={<RequireAuth><TrainingPage /></RequireAuth>} />
          <Route path="/coaching" element={<RequireAuth><CoachingPage /></RequireAuth>} />
          <Route path="/reviews/:id" element={<RequireAuth><ReviewPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
