import { RouterProvider } from 'react-router';
import { router } from './routes';
import { WorkflowProvider } from './contexts/WorkflowContext';

export default function App() {
  return (
    <WorkflowProvider>
      <RouterProvider router={router} />
    </WorkflowProvider>
  );
}