export type AiProjectStatusPayload = {
  id: string;
  name: string;
  clientName: string;
  status?: string;
  designer?: string;
  address?: string;
  lastStatusUpdate?: string;
  openTasks: Array<{
    title: string;
    status?: string;
    priority?: string;
    deadline?: string;
    assignedTo?: string;
  }>;
  billing: {
    totalHours: number;
    uninvoicedOrOpenTotal: number;
    entryCount: number;
  };
  recentNotes: string[];
};
