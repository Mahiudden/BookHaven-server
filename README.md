# Virtual Bookshelf - Backend

This is the backend application for the Virtual Bookshelf project, built with Node.js, Express.js, and MongoDB.

## backend link: https://server-api-three.vercel.app/api/books

## Features


- RESTful API for managing books, users, reviews, bookmarks, and likes.
- User authentication and authorization using Firebase ID Tokens.
- MongoDB database integration for data storage.
- Endpoints for fetching books with filtering, sorting, and pagination.
- Endpoints for user profiles, bookmarks, and likes.
- Review and rating system for books.
- Upvote functionality for books.


## Technologies Used

- **Node.js:** JavaScript runtime environment.
- **Express.js:** Web application framework for Node.js.
- **MongoDB:** NoSQL database.
- **MongoDB Driver:** For interacting with MongoDB.
- **Firebase Admin SDK:** For verifying user ID tokens and managing users.
- **dotenv:** To load environment variables.
- **cors:** Middleware for enabling Cross-Origin Resource Sharing.

## Setup

Follow these steps to get the backend application running locally.

### Prerequisites

- Node.js and npm (or yarn) installed.
- MongoDB installed and running.
- A Firebase project set up with Authentication enabled.

### Installation

1. Navigate to the `server` directory:
   ```bash
   cd server
   ``` Update more
   

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create a `.env` file in the `server` directory and add your MongoDB connection string and Firebase Service Account Key:
   ```env
   MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
   FB_SERVICE_KEY=YOUR_BASE64_ENCODED_FIREBASE_SERVICE_ACCOUNT_KEY
   PORT=5000 # Or any desired port
   FRONTEND_URL=http://localhost:5173 # Or your frontend URL(s), comma-separated if multiple
   ```
   - Replace `YOUR_MONGODB_CONNECTION_STRING` with your MongoDB connection URI.
   - Replace `YOUR_BASE64_ENCODED_FIREBASE_SERVICE_ACCOUNT_KEY` with the base64 encoded string of your Firebase service account JSON file. You can obtain the JSON file from your Firebase project settings -> Service accounts -> Generate new private key. Then, encode the JSON content to base64.

### Running the Development Server

1. Make sure you are in the `server` directory.
2. Start the development server:
   ```bash
   npm start
   # or
   yarn start
   ```

The server should start and listen on the specified PORT (default 5000).

## API Endpoints

(Brief overview of main endpoints)

- `POST /api/register`: Register/sync user with MongoDB.
- `POST /api/login`: Login (DB lookup).
- `POST /api/books`: Add a new book.
- `GET /api/books`: Get books (with filtering, sorting, pagination).
- `GET /api/books/trending`: Get trending books.
- `GET /api/books/search`: Search books.
- `GET /api/books/:id`: Get a single book by ID.
- `PATCH /api/books/:id`: Update a book.
- `DELETE /api/books/:id`: Delete a book.
- `POST /api/books/:id/upvote`: Upvote a book.
- `POST /api/books/:id/reviews`: Add a review to a book.
- `GET /api/books/:id/reviews`: Get reviews for a book.
- `POST /api/books/:id/bookmark`: Bookmark a book.
- `DELETE /api/books/:id/bookmark`: Remove bookmark.
- `POST /api/books/:id/like`: Like a book.
- `DELETE /api/books/:id/like`: Unlike a book.
- `POST /api/books/:id/ratings`: Add or update book rating.
- `GET /api/books/:id/average-rating`: Get average rating for a book.
- `POST /api/reviews/:reviewId/like`: Like a review.
- `POST /api/reviews/:reviewId/dislike`: Dislike a review.
- `GET /api/reviews/:reviewId/status`: Get user's like/dislike status for a review.
- `GET /api/users/profile`: Get authenticated user's profile and stats.
- `PATCH /api/users/profile`: Update authenticated user's profile.
- `GET /api/users/profile/:id`: Get user profile by ID.
- `GET /api/users/bookmarks`: Get authenticated user's bookmarked books.
- `GET /api/users/likes`: Get authenticated user's liked books.

## Contributing

Describe how others can contribute to your project (optional).

## License

Specify the license for your project (optional). 
