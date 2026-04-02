import React, { useState } from 'react';

type Task = {
  id: number;
  text: string;
};

type Column = {
  name: string;
  tasks: Task[];
};

const KanbanBoard: React.FC = () => {
  const [columns, setColumns] = useState<Column[]>([
    { name: 'Todo', tasks: [] },
    { name: 'In Progress', tasks: [] },
    { name: 'Done', tasks: [] },
  ]);

  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const addTask = (columnIndex: number) => {
    const taskText = prompt('Enter task:');
    if (taskText) {
      const newTask: Task = { id: Date.now(), text: taskText };
      const newColumns = [...columns];
      newColumns[columnIndex].tasks.push(newTask);
      setColumns(newColumns);
    }
  };

  const onDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const onDrop = (columnIndex: number) => {
    if (draggedTask) {
      const newColumns = columns.map((column) => ({
        ...column,
        tasks: column.tasks.filter((task) => task.id !== draggedTask.id),
      }));
      newColumns[columnIndex].tasks.push(draggedTask);
      setColumns(newColumns);
      setDraggedTask(null);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      {columns.map((column, columnIndex) => (
        <div
          key={column.name}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(columnIndex)}
          style={{
            width: '30%',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <h2>{column.name}</h2>
          {column.tasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={() => onDragStart(task)}
              style={{
                margin: '10px 0',
                padding: '10px',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                cursor: 'grab',
              }}
            >
              {task.text}
            </div>
          ))}
          <button onClick={() => addTask(columnIndex)}>Add Card</button>
        </div>
      ))}
    </div>
  );
};

export default KanbanBoard;