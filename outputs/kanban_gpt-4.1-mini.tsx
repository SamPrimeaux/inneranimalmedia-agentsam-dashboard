import React, { useState, useCallback } from "react";

type Card = {
  id: string;
  content: string;
};

type ColumnId = "todo" | "inprogress" | "done";

const columnTitles: Record<ColumnId, string> = {
  todo: "Todo",
  inprogress: "In Progress",
  done: "Done",
};

export const KanbanBoard: React.FC = () => {
  const [columns, setColumns] = useState<Record<ColumnId, Card[]>>({
    todo: [],
    inprogress: [],
    done: [],
  });

  const [dragged, setDragged] = useState<{
    cardId: string;
    fromColumn: ColumnId;
  } | null>(null);

  const onDragStart = useCallback(
    (
      e: React.DragEvent<HTMLDivElement>,
      cardId: string,
      fromColumn: ColumnId
    ) => {
      setDragged({ cardId, fromColumn });
      e.dataTransfer.effectAllowed = "move";
      // For Firefox compatibility
      e.dataTransfer.setData("text/plain", cardId);
    },
    []
  );

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    []
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, toColumn: ColumnId) => {
      e.preventDefault();
      if (!dragged) return;

      if (dragged.fromColumn === toColumn) {
        setDragged(null);
        return;
      }

      setColumns((cols) => {
        const fromCards = [...cols[dragged.fromColumn]];
        const cardIndex = fromCards.findIndex((c) => c.id === dragged.cardId);
        if (cardIndex === -1) return cols;

        const [movedCard] = fromCards.splice(cardIndex, 1);
        const toCards = [...cols[toColumn], movedCard];

        return {
          ...cols,
          [dragged.fromColumn]: fromCards,
          [toColumn]: toCards,
        };
      });
      setDragged(null);
    },
    [dragged]
  );

  const addCard = useCallback(
    (column: ColumnId) => {
      const content = prompt("Enter card content");
      if (!content?.trim()) return;

      const newCard: Card = {
        id: Math.random().toString(36).slice(2, 9),
        content: content.trim(),
      };

      setColumns((cols) => ({
        ...cols,
        [column]: [...cols[column], newCard],
      }));
    },
    []
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: 16,
        height: "100vh",
        boxSizing: "border-box",
        background: "#f0f2f5",
      }}
    >
      {(Object.keys(columns) as ColumnId[]).map((colId) => (
        <div
          key={colId}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, colId)}
          style={{
            flex: 1,
            background: "#fff",
            borderRadius: 4,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            maxHeight: "100%",
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <h2 style={{ margin: "0 0 12px 0", userSelect: "none" }}>
            {columnTitles[colId]}
          </h2>
          <div
            style={{
              flexGrow: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {columns[colId].map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => onDragStart(e, card.id, colId)}
                style={{
                  padding: "8px 12px",
                  background: "#e2e8f0",
                  borderRadius: 4,
                  cursor: "grab",
                  userSelect: "none",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.1), 0 1px 1px rgba(0,0,0,0.06)",
                }}
              >
                {card.content}
              </div>
            ))}
          </div>
          <button
            onClick={() => addCard(colId)}
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 4,
              border: "none",
              background: "#3b82f6",
              color: "white",
              cursor: "pointer",
              userSelect: "none",
            }}
            type="button"
          >
            + Add card
          </button>
        </div>
      ))}
    </div>
  );
};