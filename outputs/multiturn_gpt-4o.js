const express = require('express');
const { z } = require('zod');
const app = express();
const port = 3000;

app.use(express.json());

// Sample data for users
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' }
];

// Zod schema for user validation
const userSchema = z.object({
  name: z.string().min(1, 'Name is required')
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// Users endpoint
app.get('/users', (req, res) => {
  res.status(200).json(users);
});

// Add new user endpoint
app.post('/users', (req, res) => {
  try {
    const validatedData = userSchema.parse(req.body);
    const newUser = {
      id: users.length + 1,
      ...validatedData
    };
    users.push(newUser);
    res.status(201).json(newUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});