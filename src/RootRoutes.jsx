import { Routes, Route } from 'react-router-dom';
import { StudentApp } from './App';
import TeacherAuthGate from './teacher/TeacherAuthGate';
import TeacherPortalLayout from './teacher/TeacherPortalLayout';
import TeacherWorkspace from './teacher/TeacherWorkspace';

export default function RootRoutes() {
  return (
    <Routes>
      <Route path="/" element={<StudentApp />} />
      <Route path="/teacher" element={<TeacherAuthGate />}>
        <Route element={<TeacherPortalLayout />}>
          <Route index element={<TeacherWorkspace />} />
        </Route>
      </Route>
    </Routes>
  );
}
