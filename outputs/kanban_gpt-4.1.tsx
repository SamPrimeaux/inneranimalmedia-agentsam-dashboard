import React, { useState, useRef } from "react";

type ColumnType = "todo" | "inprogress" | "done";

interface Card {
  id: string;
  text: string;
}

type BoardState = {
  [key in ColumnType]: Card[];
};

const COLUMN_TITLES: { [key in ColumnType]: string } = {
  todo: "Todo",
  inprogress: "In Progress",
  done: "Done",
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const KanbanBoard: React.FC = () => {
  const [board, setBoard] = useState<BoardState>({
    todo: [
      { id: generateId(), text: "Sample Task 1" },
      { id: generateId(), text: "Sample Task 2" },
    ],
    inprogress: [],
    done: [],
  });

  const [draggedCard, setDraggedCard] = useState<{
    card: Card;
    fromColumn: ColumnType;
  } | null>(null);

  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  const [addingCardColumn, setAddingCardColumn] = useState<ColumnType | null>(
    null
  );
  const [newCardText, setNewCardText] = useState<string>("");

  const columnRefs = {
    todo: useRef<HTMLDivElement>(null),
    inprogress: useRef<HTMLDivElement>(null),
    done: useRef<HTMLDivElement>(null),
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    card: Card,
    fromColumn: ColumnType
  ) => {
    setDraggedCard({ card, fromColumn });
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      // Hide the dragged element
      e.currentTarget.style.opacity = "0.3";
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    setDraggedCard(null);
    setDragOverCardId(null);
    e.currentTarget.style.opacity = "1";
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    column: ColumnType,
    cardId?: string
  ) => {
    e.preventDefault();
    if (cardId) setDragOverCardId(cardId);
    else setDragOverCardId(null);
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    toColumn: ColumnType,
    toCardId?: string
  ) => {
    e.preventDefault();
    if (!draggedCard) return;
    const { card, fromColumn } = draggedCard;
    if (fromColumn === toColumn && !toCardId) return;

    setBoard((prev) => {
      // Remove card from old column
      let newFrom = prev[fromColumn].filter((c) => c.id !== card.id);
      // Insert card into new column at correct position
      let newTo = [...prev[toColumn]];
      let insertIdx = toCardId
        ? newTo.findIndex((c) => c.id === toCardId)
        : newTo.length;
      newTo.splice(insertIdx, 0, card);

      return {
        ...prev,
        [fromColumn]: newFrom,
        [toColumn]: newTo,
      };
    });

    setDraggedCard(null);
    setDragOverCardId(null);
  };

  const handleAddCard = (column: ColumnType) => {
    setAddingCardColumn(column);
    setNewCardText("");
  };

  const handleAddCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingCardColumn || !newCardText.trim()) return;
    setBoard((prev) => ({
      ...prev,
      [addingCardColumn!]: [
        ...prev[addingCardColumn!],
        { id: generateId(), text: newCardText.trim() },
      ],
    }));
    setAddingCardColumn(null);
    setNewCardText("");
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "24px",
        padding: "24px",
        background: "#f4f5f7",
        minHeight: "100vh",
      }}
    >
      {(["todo", "inprogress", "done"] as ColumnType[]).map((column) => (
        <div
          key={column}
          ref={columnRefs[column]}
          onDragOver={(e) => handleDragOver(e, column)}
          onDrop={(e) => handleDrop(e, column)}
          style={{
            background: "#fff",
            borderRadius: "8px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            flex: 1,
            minWidth: "280px",
            display: "flex",
            flexDirection: "column",
            padding: "16px",
          }}
        >
          <h2 style={{ margin: "0 0 16px 0" }}>{COLUMN_TITLES[column]}</h2>
          <div style={{ flex: 1 }}>
            {board[column].map((card) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => handleDragStart(e, card, column)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, column, card.id)}
                onDrop={(e) => handleDrop(e, column, card.id)}
                style={{
                  padding: "12px",
                  marginBottom: "10px",
                  background: "#e3e4e6",
                  borderRadius: "6px",
                  boxShadow:
                    dragOverCardId === card.id
                      ? "0 0 0 2px #0079bf"
                      : "0 1px 2px rgba(0,0,0,0.04)",
                  opacity:
                    draggedCard && draggedCard.card.id === card.id ? 0.3 : 1,
                  cursor: "grab",
                  transition: "box-shadow 0.2s",
                  border:
                    dragOverCardId === card.id
                      ? "2px solid #0079bf"
                      : "2px solid transparent",
                }}
              >
                {card.text}
              </div>
            ))}
            {/* Drop zone at end of column */}
            <div
              onDragOver={(e) => handleDragOver(e, column)}
              onDrop={(e) => handleDrop(e, column)}
              style={{
                minHeight: "32px",
                border:
                  dragOverCardId === null && draggedCard
                    ? "2px dashed #0079bf"
                    : "2px dashed transparent",
                borderRadius: "6px",
                marginTop: "4px",
                transition: "border 0.2s",
              }}
            />
          </div>
          {addingCardColumn === column ? (
            <form onSubmit={handleAddCardSubmit} style={{ marginTop: "12px" }}>
              <input
                autoFocus
                type="text"
                value={newCardText}
                onChange={(e) => setNewCardText(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
                placeholder="Card text"
              />
              <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                <button type="submit" style={{ padding: "6px 12px" }}>
                  Add
                </button>
                <button
                  type="button"
                  style={{ padding: "6px 12px" }}
                  onClick={() => setAddingCardColumn(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => handleAddCard(column)}
              style={{
                marginTop: "12px",
                padding: "8px 12px",
                borderRadius: "4px",
                background: "#0079bf",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              + Add Card
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default KanbanBoard;