const express = require('express');
require('dotenv').config();
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000; // Using port 5000

const admin = require("firebase-admin");
// Decode Firebase Service Account Key from environment variable
let serviceAccount;
try {
  const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
  serviceAccount = JSON.parse(decoded);
} catch (error) {
  console.error('Error decoding Firebase Service Account Key:', error);
  // Exit if key is missing or invalid
  process.exit(1);
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://my-assinment11.web.app'], // Allow frontend origin(s)
  credentials: true
}));
app.use(express.json());
// cookieParser is not needed for Firebase ID Token auth
// app.use(cookieParser());

// Verify Firebase ID Token Middleware
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized access: No token provided or invalid format' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    // Attach user info from Firebase token to request object
    req.user = { email: decodedToken.email, uid: decodedToken.uid, name: decodedToken.name, photoURL: decodedToken.picture };
    next();
  } catch (error) {
    console.error('Firebase ID Token verification error:', error.message); // Log specific error message
    return res.status(401).send({ message: 'Unauthorized access: Invalid token' });
  }
};

const uri = process.env.MONGODB_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 5000, // 5 seconds timeout
});

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });

    const database = client.db('virtual-bookshelf'); // Use your database name
    const usersCollection = database.collection('users');
    const booksCollection = database.collection('books');
    const reviewsCollection = database.collection('reviews');
    const bookmarksCollection = database.collection('bookmarks');
    const ratingsCollection = database.collection('ratings');
    const reviewLikesCollection = database.collection('reviewLikes');
    const reviewDislikesCollection = database.collection('reviewDislikes');


    app.post('/api/register', async (req, res) => {
      try {
        const { email, name, profilePhoto, uid } = req.body; // Expect Firebase user info from frontend

        // Check if user already exists in MongoDB
        const existingUser = await usersCollection.findOne({ email: email });
        if (existingUser) {
          // For now, just return existing user info or a message
          return res.status(200).json({ message: 'User already exists in DB', user: existingUser });
        }
        // Create new user document in MongoDB
        const user = {
          _id: uid, // Use Firebase UID as MongoDB _id for easy lookup
          name: name || 'User', // Use name from Firebase or default
          email: email,
          profilePhoto: profilePhoto || '', // Use photoURL from Firebase or empty
          createdAt: new Date()
        };

        const result = await usersCollection.insertOne(user);
        const newUser = result.ops ? result.ops[0] : user; // Handle different driver versions

        res.status(201).json({
          user: newUser,
          message: 'User synced to DB successfully'
        });
      } catch (error) {
        console.error('Register/Sync user error:', error);
        res.status(500).json({ message: 'Server error during user registration/sync' });
      }
    });


    app.post('/api/login', verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const userUid = req.user.uid; // Get UID from authenticated user

        // Find user in MongoDB by UID
        let user = await usersCollection.findOne({ _id: userUid }, { projection: { password: 0 } });

        const firebaseName = req.user.name || 'Anonymous';
        const firebasePhotoURL = req.user.photoURL || '';

        // Prepare update/insert document based on Firebase data
        const updateDoc = {
            name: firebaseName,
            email: userEmail,
            profilePhoto: firebasePhotoURL,
            updatedAt: new Date(),
        };

        if (!user) {
          // If user not found, create a new document with Firebase data
          console.warn(`User with UID ${userUid} not found in MongoDB during login, creating document with Firebase data.`);
          const newUserDoc = {
            _id: userUid,
            ...updateDoc,
            createdAt: new Date(),
          };
          await usersCollection.insertOne(newUserDoc);
          user = newUserDoc; // Use the newly created document

        } else {
            // If user is found, update their profile in MongoDB with the latest Firebase info
             if (user.name !== firebaseName || user.profilePhoto !== firebasePhotoURL || !user.name || !user.profilePhoto) {
                console.log(`Updating MongoDB profile for ${userEmail} with latest Firebase data during login.`);
                await usersCollection.updateOne(
                    { _id: userUid },
                    { $set: updateDoc }
                );
                // Fetch the updated user document
                user = await usersCollection.findOne({ _id: userUid }, { projection: { password: 0 } });
             } else {
                console.log(`MongoDB profile for ${userEmail} is already up-to-date with Firebase data during login.`);
                // User data is already synced, no update needed in DB
             }
        }

        res.json({
          user: user,
          message: 'User synced and logged in successfully'
        });

      } catch (error) {
        console.error('Login sync error:', error);
        res.status(500).json({ message: 'Server error during login sync' });
      }
    });

    // Routes without :id parameter
    // Book Routes - Protected with verifyFirebaseToken
    app.post('/api/books', verifyFirebaseToken, async (req, res) => {
      try {
        const book = {
          ...req.body,
          userEmail: req.user.email, // Use email from Firebase token
          userName: req.user.name || 'Anonymous', // Use name from Firebase token or default
          upvote: 0,
          upvotedBy: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          readingStatus: req.body.readingStatus || 'Want-to-Read', // Use provided status or default
          shares: 0,
        };
        const result = await booksCollection.insertOne(book);
        res.status(201).json(result.ops ? result.ops[0] : { _id: result.insertedId, ...book });
      } catch (error) {
        console.error('Create book error:', error);
        res.status(500).json({ message: 'Server error creating book' });
      }
    });

    // GET /api/books - Get books with filtering, sorting, pagination (does not require authentication)
    app.get('/api/books', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        const category = req.query.category || '';
        const status = req.query.status || 'all';
        const readingStatus = req.query.readingStatus || '';
        const sortBy = req.query.sort || 'newest';
        const userEmail = req.query.userEmail || ''; // Add userEmail parameter

        let query = {};
        
        // Add userEmail filter if provided
        if (userEmail) {
          query.userEmail = userEmail;
        }

        // Add category filter if provided
        if (category) {
          query.bookCategory = category;
        }

        // Add status filter if provided
        if (status !== 'all') {
          query.status = status;
        }

        // Add reading status filter if provided
        if (readingStatus) {
          query.readingStatus = readingStatus;
        }

        // Build sort object based on sortBy parameter
        let sort = {};
        switch (sortBy) {
          case 'oldest':
            sort.createdAt = 1;
            break;
          case 'popular':
            sort.upvote = -1;
            break;
          case 'title_asc':
            sort.bookTitle = 1;
            break;
          case 'title_desc':
            sort.bookTitle = -1;
            break;
          default: // 'newest'
            sort.createdAt = -1;
        }

        const totalBooks = await booksCollection.countDocuments(query);
        const books = await booksCollection.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.json({
          books,
          currentPage: page,
          totalPages: Math.ceil(totalBooks / limit),
          totalBooks
        });
      } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ message: 'Error fetching books' });
      }
    });

    app.get('/api/books/trending', async (req, res) => {
      try {
        const trendingBooks = await booksCollection.find()
          .sort({ upvote: -1 })
          .limit(10)
          .toArray();

        res.status(200).json(trendingBooks);
      } catch (error) {
        console.error('Error fetching trending books:', error);
        res.status(500).json({ message: 'Failed to fetch trending books' });
      }
    });

    app.get('/api/books/search', async (req, res) => {
        try {
            const { q } = req.query;
            if (!q) {
                return res.status(400).json({ message: 'Search query parameter "q" is required' });
            }

            const searchQuery = {
                 $or: [
                    { bookTitle: { $regex: q, $options: 'i' } },
                    { bookAuthor: { $regex: q, $options: 'i' } },
                    { bookOverview: { $regex: q, $options: 'i' } }, // Also search in overview
                    { bookCategory: { $regex: q, $options: 'i' } } // Also search in category
                 ]
            };

            const searchResults = await booksCollection.find(searchQuery).limit(20).toArray(); // Limit search results
            res.json({ books: searchResults }); // Return results in a 'books' array

        } catch (error) {
            console.error('Search books error:', error);
            res.status(500).json({ message: 'Server error searching books' });
        }
    });

    app.get('/api/books/:id', async (req, res) => {
      try {
        const bookId = req.params.id;
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }
        const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
        if (!book) {
          return res.status(404).json({ message: 'Book not found' });
        }

        const reviews = await reviewsCollection.find({ bookId: new ObjectId(bookId) }).toArray();

        const totalReviews = reviews.length;
        const averageRating = totalReviews > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

        const bookWithRating = { ...book, rating: averageRating, totalReviews: totalReviews };

        res.json(bookWithRating);
      } catch (error) {
        console.error('Get book by ID error:', error);
        res.status(500).json({ message: 'Server error fetching book' });
      }
    });

    app.patch('/api/books/:id', verifyFirebaseToken, async (req, res) => {
      try {
        const bookId = req.params.id;
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }
        const updateData = req.body;

        const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
        if (!book) {
          return res.status(404).json({ message: 'Book not found' });
        }

        if (book.userEmail !== req.user.email && updateData.readingStatus === undefined) {
          return res.status(403).json({ message: 'Not authorized to update this book' });
        }

        let updateDoc = { $set: { ...updateData, updatedAt: new Date() } };
        delete updateDoc.$set._id;


        const result = await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          updateDoc
        );

        if (result.modifiedCount === 0) {
          const existingBook = await booksCollection.findOne({ _id: new ObjectId(bookId) });
          if (existingBook) return res.status(200).json({ message: 'Book data is the same, no update needed', book: existingBook });
          else return res.status(404).json({ message: 'Book not found after update attempt' });
        }

        const updatedBook = await booksCollection.findOne({ _id: new ObjectId(bookId) });
        res.json({ message: 'Book updated successfully', book: updatedBook });

      } catch (error) {
        console.error('Update book error:', error);
        res.status(500).json({ message: 'Server error updating book' });
      }
    });

    app.delete('/api/books/:id', verifyFirebaseToken, async (req, res) => {
      try {
        const bookId = req.params.id;
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }

        const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
        if (!book) {
          return res.status(404).json({ message: 'Book not found' });
        }

        if (book.userEmail !== req.user.email) {
          return res.status(403).json({ message: 'Not authorized to delete this book' });
        }

        await booksCollection.deleteOne({ _id: new ObjectId(bookId) });

        await reviewsCollection.deleteMany({ bookId: new ObjectId(bookId) });
        await bookmarksCollection.deleteMany({ bookId: new ObjectId(bookId) });
        await ratingsCollection.deleteMany({ bookId: new ObjectId(bookId) });

        res.json({ message: 'Book deleted successfully' });
      } catch (error) {
        console.error('Delete book error:', error);
        res.status(500).json({ message: 'Server error deleting book' });
      }
    });

    app.post('/api/books/:id/upvote', verifyFirebaseToken, async (req, res) => {
      try {
        const bookId = req.params.id;
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }
        const userEmail = req.user.email;

        const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
        if (!book) {
          return res.status(404).json({ message: 'Book not found' });
        }

        if (book.userEmail === userEmail) {
          return res.status(400).json({ message: "You can't upvote your own book" });
        }

        const result = await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          { $inc: { upvote: 1 } } // Increment the 'upvote' field
        );

        if (result.modifiedCount === 0) {
             const updatedBook = await booksCollection.findOne({ _id: new ObjectId(bookId) });
             if (!updatedBook) return res.status(404).json({ message: 'Book not found after update attempt' });
        }

        const updatedBook = await booksCollection.findOne({ _id: new ObjectId(bookId) });

        res.json({ message: 'Book upvoted successfully', book: updatedBook });

      } catch (error) {
        console.error('Upvote book error:', error);
        res.status(500).json({ message: 'Server error processing upvote' });
      }
    });

    app.post('/api/books/:id/bookmark', verifyFirebaseToken, async (req, res) => {
      try {
        const bookId = req.params.id;
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }
        const userEmail = req.user.email;

        const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
        if (!book) {
          return res.status(404).json({ message: 'Book not found' });
        }

        const existingBookmark = await bookmarksCollection.findOne({
          bookId: new ObjectId(bookId),
          userEmail: userEmail
        });

        if (existingBookmark) {
          return res.status(400).json({ message: 'Book already bookmarked' });
        }

        const bookmark = {
          bookId: new ObjectId(bookId),
          userEmail: userEmail,
          createdAt: new Date()
        };

        await bookmarksCollection.insertOne(bookmark);
        res.status(201).json({ message: 'Book bookmarked successfully' });
      } catch (error) {
        console.error('Create bookmark error:', error);
        res.status(500).json({ message: 'Server error creating bookmark' });
      }
    });

    app.delete('/api/books/:id/bookmark', verifyFirebaseToken, async (req, res) => {
      try {
        const bookId = req.params.id;
        // Validate if bookId is a valid MongoDB ObjectId
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }
        const userEmail = req.user.email;

        const result = await bookmarksCollection.deleteOne({
          bookId: new ObjectId(bookId),
          userEmail: userEmail
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Bookmark not found' });
        }

        res.json({ message: 'Bookmark removed successfully' });
      } catch (error) {
        console.error('Delete bookmark error:', error);
        res.status(500).json({ message: 'Server error removing bookmark' });
      }
    });

    // Review Routes - Protected with verifyFirebaseToken where user action is involved
    app.post('/api/books/:id/reviews', verifyFirebaseToken, async (req, res) => {
      try {
        const bookId = req.params.id;
        // Validate if bookId is a valid MongoDB ObjectId
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }
        const userEmail = req.user.email;
        const userName = req.user.name || 'Anonymous';
        const userPhoto = req.user.photoURL || '';
        const { reviewText, rating } = req.body;

        const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
        if (!book) {
          return res.status(404).json({ message: 'Book not found' });
        }

        // Optional: Check if user has already reviewed if you only allow one review per user
        const existingReview = await reviewsCollection.findOne({
          bookId: new ObjectId(bookId),
          userEmail: userEmail
        });
        if (existingReview) {
          return res.status(400).json({ message: 'You have already reviewed this book. Please update your existing review.' });
        }

        const review = {
          bookId: new ObjectId(bookId),
          userEmail: userEmail,
          userName: userName,
          userPhoto: userPhoto,
          reviewText: reviewText,
          rating: rating, // Store rating with the review
          likes: 0,
          dislikes: 0,
          createdAt: new Date(),
        };

        const result = await reviewsCollection.insertOne(review);
        const newReview = result.ops ? result.ops[0] : { _id: result.insertedId, ...review };

        // --- Recalculate average rating and total reviews --- //
        const allReviewsForBook = await reviewsCollection.find({ bookId: new ObjectId(bookId) }).toArray();
        const totalReviews = allReviewsForBook.length;
        // Add logging for the ratings array
        const averageRating = totalReviews > 0
          ? allReviewsForBook.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

        // Optional: Update the book document with the new average rating and total reviews
        await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          { $set: { rating: averageRating, totalReviews: totalReviews } } // Assuming 'rating' and 'totalReviews' fields exist in the book document
        );
        // --- End recalculation --- //


        res.status(201).json({ message: 'Review added successfully', review: newReview, averageRating: averageRating, totalReviews: totalReviews });
      } catch (error) {
        console.error('Create review error:', error);
        res.status(500).json({ message: 'Server error creating review' });
      }
    });

    app.get('/api/books/:id/reviews', async (req, res) => {
      try {
        const bookId = req.params.id;
        if (!ObjectId.isValid(bookId)) {
          return res.status(400).json({ message: 'Invalid Book ID format' });
        }
        const reviews = await reviewsCollection.find({ bookId: new ObjectId(bookId) })
          .sort({ createdAt: -1 }).toArray();
        res.json(reviews);
      } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({ message: 'Server error fetching reviews' });
      }
    });

    app.get('/api/users/profile', verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const userUid = req.user.uid; // Get UID from authenticated user

        let user = await usersCollection.findOne({ _id: userUid }, { projection: { password: 0 } });

        const firebaseName = req.user.name || 'Anonymous';
        const firebasePhotoURL = req.user.photoURL || '';

        const updateDoc = {
            name: firebaseName,
            email: userEmail,
            profilePhoto: firebasePhotoURL,
            updatedAt: new Date(),
        };

        if (!user) {
          console.warn(`User with UID ${userUid} not found in MongoDB, creating document with Firebase data.`);
          const newUserDoc = {
            _id: userUid,
            ...updateDoc,
            createdAt: new Date(),
          };
          await usersCollection.insertOne(newUserDoc);
          user = newUserDoc; // Use the newly created document

        } else {
            if (user.name !== firebaseName || user.profilePhoto !== firebasePhotoURL || !user.name || !user.profilePhoto) {
                console.log(`Updating MongoDB profile for ${userEmail} with latest Firebase data.`);
                 await usersCollection.updateOne(
                    { _id: userUid },
                    { $set: updateDoc }
                );
                // Fetch the updated user document to return
                user = await usersCollection.findOne({ _id: userUid }, { projection: { password: 0 } });
            } else {
              console.log(`MongoDB profile for ${userEmail} is already up-to-date with Firebase data.`);
              // User data is already synced, no update needed in DB
            }
        }

        const books = await booksCollection.find({ userEmail: userEmail }).toArray();
        const bookStats = {
          total: books.length,
          read: books.filter(book => book.readingStatus === 'Read').length,
          reading: books.filter(book => book.readingStatus === 'Reading').length,
          wantToRead: books.filter(book => book.readingStatus === 'Want-to-Read').length,
        };

        const bookmarkCount = await bookmarksCollection.countDocuments({ userEmail: userEmail });
        const reviewCount = await reviewsCollection.countDocuments({ userEmail: userEmail });
        const ratingCount = await ratingsCollection.countDocuments({ userEmail: userEmail });

        res.json({
          user: { // Return relevant user info from MongoDB
            id: user._id,
            name: user.name,
            email: user.email,
            profilePhoto: user.profilePhoto,
            bio: user.bio // Include bio if you have it
          },
          bookStats,
          engagementStats: {
            bookmarks: bookmarkCount,
            reviews: reviewCount,
            ratings: ratingCount,
          }
        });
      } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ message: 'Server error fetching user profile' });
      }
    });

    app.patch('/api/users/profile', verifyFirebaseToken, async (req, res) => {
      try {
        const { displayName, photoURL, bio } = req.body; // Get updated data from request body
        const userUid = req.user.uid; // Get user UID from verified token

        // Update user profile in Firebase Authentication
        const firebaseAuthUpdateParams = {};
        if (displayName !== undefined) firebaseAuthUpdateParams.displayName = displayName;
        if (photoURL !== undefined) firebaseAuthUpdateParams.photoURL = photoURL;

        // Only attempt to update Firebase Auth if there are params to update
        if (Object.keys(firebaseAuthUpdateParams).length > 0) {
             await admin.auth().updateUser(userUid, firebaseAuthUpdateParams);
        }

        // Update user document in MongoDB
        const mongoUpdateDoc = { $set: {} };
        if (displayName !== undefined) mongoUpdateDoc.$set.name = displayName; // Assuming 'name' in MongoDB corresponds to 'displayName'
        if (photoURL !== undefined) mongoUpdateDoc.$set.profilePhoto = photoURL; // Assuming 'profilePhoto' in MongoDB corresponds to 'photoURL'
        if (bio !== undefined) mongoUpdateDoc.$set.bio = bio;
        mongoUpdateDoc.$set.updatedAt = new Date(); // Update timestamp

        // Only attempt to update MongoDB if there are fields to set
        if (Object.keys(mongoUpdateDoc.$set).length > 0) {
             await usersCollection.updateOne({ _id: userUid }, mongoUpdateDoc);
        }

        // Fetch the updated user document from MongoDB to return to frontend
        const updatedUser = await usersCollection.findOne({ _id: userUid }, { projection: { password: 0 } }); // Exclude password

        res.status(200).json(updatedUser);
      } catch (error) {
        console.error('Update profile error:', error);
        // Handle specific Firebase or MongoDB errors if needed
        res.status(500).json({ message: error.message || 'Server error updating profile' });
      }
    });

    // GET /api/users/profile/:id - Get user profile by ID (does not require authentication to view, but auth can check if current user is viewing their own profile)
    app.get('/api/users/profile/:id', async (req, res) => {
      try {
        const userId = req.params.id;
        
        const user = await usersCollection.findOne({ _id: userId }, { projection: { password: 0 } }); // Exclude password
        if (!user) {
          return res.status(404).json({ message: 'User not found in DB.' });
        }

        const books = await booksCollection.find({ userEmail: user.email }).toArray();
        const bookStats = {
          total: books.length,
          read: books.filter(book => book.readingStatus === 'Read').length,
          reading: books.filter(book => book.readingStatus === 'Reading').length,
          wantToRead: books.filter(book => book.readingStatus === 'Want-to-Read').length,
        };

        // Fetch user's engagement stats - optional, depending on privacy policy
        const bookmarkCount = await bookmarksCollection.countDocuments({ userEmail: user.email });
        const reviewCount = await reviewsCollection.countDocuments({ userEmail: user.email });
        const ratingCount = await ratingsCollection.countDocuments({ userEmail: user.email });

        res.json({
          user: { // Return relevant user info from MongoDB
            id: user._id,
            name: user.name,
            email: user.email, // Consider privacy if showing email for others
            profilePhoto: user.profilePhoto,
            bio: user.bio // Include bio
          },
          bookStats, // Include stats if showing
          engagementStats: { // Include engagement if showing
            bookmarks: bookmarkCount,
            reviews: reviewCount,
            ratings: ratingCount,
          }
        });
      } catch (error) {
        console.error('Get user profile by ID error:', error);
        res.status(500).json({ message: 'Server error fetching user profile by ID' });
      }
    });

    // User Reading List and Activity Log Routes - Protected with verifyFirebaseToken
    app.get('/api/users/reading-list', verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.user.email;

        const readingList = await booksCollection.find({
          userEmail: userEmail,
          readingStatus: { $in: ['Read', 'Reading', 'Want-to-Read'] } // Include only valid statuses
        }).sort({ updatedAt: -1 }).toArray(); // Sort by last update

        res.json(readingList);
      } catch (error) {
        console.error('Get reading list error:', error);
        res.status(500).json({ message: 'Server error fetching reading list' });
      }
    });
    app.get('/api/users/activity', verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.user.email;

        // Example: Fetch recent reviews by the user
        const recentReviews = await reviewsCollection.find({ userEmail: userEmail })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();

        // Example: Fetch recent books added by the user
        const recentBooksAdded = await booksCollection.find({ userEmail: userEmail })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();

        // Combine and sort activities by date
        const activity = [
          ...recentReviews.map(review => ({ type: 'review', date: review.createdAt, details: review })),
          ...recentBooksAdded.map(book => ({ type: 'book_added', date: book.createdAt, details: book })),
          // Add other activity types here (e.g., upvotes given, books bookmarked/liked, reading status changes if tracked separately)
        ].sort((a, b) => b.date - a.date).slice(0, 10); // Sort by date and limit total

        res.json(activity);
      } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ message: 'Server error fetching activity' });
      }
    });
    // Add a simple ping route to check server status
    app.get('/ping', (req, res) => {
      res.send('Server is running and reachable!');
    });

    // GET /api/users/stats - Get user statistics
    app.get('/api/users/stats', verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.user.email;

        // Fetch user's book stats (total, read, reading, wantToRead)
        const books = await booksCollection.find({ userEmail: userEmail }).toArray();
        const stats = {
          totalBooks: books.length,
          booksRead: books.filter(book => book.readingStatus === 'Read').length,
          currentlyReading: books.filter(book => book.readingStatus === 'Reading').length,
          wantToRead: books.filter(book => book.readingStatus === 'Want-to-Read').length,
          // Calculate total reviews and upvotes received from all books owned by the user
          totalReviews: await reviewsCollection.countDocuments({ userEmail: userEmail }), // Count reviews written by the user
          totalUpvotes: books.reduce((sum, book) => sum + (book.upvote || 0), 0), // Sum upvotes on user's books
        };

        res.json(stats);
      } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ message: 'Server error fetching user statistics' });
      }
    });

    // GET /api/users/bookmarks - Get bookmarks for the authenticated user
    app.get('/api/users/bookmarks', verifyFirebaseToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const userBookmarks = await bookmarksCollection.find({ userEmail: userEmail }).toArray();

        // For each bookmark, fetch the full book details
        const bookIds = userBookmarks.map(bookmark => bookmark.bookId);
        const bookmarkedBooks = await booksCollection.find({ _id: { $in: bookIds } }).toArray();

        res.json(bookmarkedBooks); // Return the list of book objects
      } catch (error) {
        console.error('Error fetching user bookmarks:', error);
        res.status(500).json({ message: 'Server error fetching user bookmarks' });
      }
    });

    // Like a review
    app.post('/api/reviews/:reviewId/like', verifyFirebaseToken, async (req, res) => {
      try {
        const reviewId = req.params.reviewId;
        const userEmail = req.user.email;

        if (!ObjectId.isValid(reviewId)) {
          return res.status(400).json({ message: 'Invalid Review ID format' });
        }

        // Check if review exists
        const review = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
        if (!review) {
          return res.status(404).json({ message: 'Review not found' });
        }

        // Check if user has already liked
        const existingLike = await reviewLikesCollection.findOne({
          reviewId: new ObjectId(reviewId),
          userEmail: userEmail
        });

        if (existingLike) {
          // Unlike if already liked
          await reviewLikesCollection.deleteOne({
            reviewId: new ObjectId(reviewId),
            userEmail: userEmail
          });
          
          // Update review likes count
          await reviewsCollection.updateOne(
            { _id: new ObjectId(reviewId) },
            { $inc: { likes: -1 } }
          );

          const updatedReview = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
          return res.json({ 
            message: 'Review unliked',
            likes: updatedReview.likes,
            userLiked: false
          });
        }

        // Remove any existing dislike
        const existingDislike = await reviewDislikesCollection.findOne({
          reviewId: new ObjectId(reviewId),
          userEmail: userEmail
        });

        if (existingDislike) {
          await reviewDislikesCollection.deleteOne({
            reviewId: new ObjectId(reviewId),
            userEmail: userEmail
          });
          await reviewsCollection.updateOne(
            { _id: new ObjectId(reviewId) },
            { $inc: { dislikes: -1 } }
          );
        }

        // Add new like
        await reviewLikesCollection.insertOne({
          reviewId: new ObjectId(reviewId),
          userEmail: userEmail,
          createdAt: new Date()
        });

        // Update review likes count
        await reviewsCollection.updateOne(
          { _id: new ObjectId(reviewId) },
          { $inc: { likes: 1 } }
        );

        const updatedReview = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
        return res.json({ 
          message: 'Review liked',
          likes: updatedReview.likes,
          userLiked: true
        });

      } catch (error) {
        console.error('Error liking review:', error);
        res.status(500).json({ message: 'Server error liking review' });
      }
    });

    // Dislike a review
    app.post('/api/reviews/:reviewId/dislike', verifyFirebaseToken, async (req, res) => {
      try {
        const reviewId = req.params.reviewId;
        const userEmail = req.user.email;

        if (!ObjectId.isValid(reviewId)) {
          return res.status(400).json({ message: 'Invalid Review ID format' });
        }

        // Check if review exists
        const review = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
        if (!review) {
          return res.status(404).json({ message: 'Review not found' });
        }

        // Check if user has already disliked
        const existingDislike = await reviewDislikesCollection.findOne({
          reviewId: new ObjectId(reviewId),
          userEmail: userEmail
        });

        if (existingDislike) {
          // Remove dislike if already disliked
          await reviewDislikesCollection.deleteOne({
            reviewId: new ObjectId(reviewId),
            userEmail: userEmail
          });
          
          // Update review dislikes count
          await reviewsCollection.updateOne(
            { _id: new ObjectId(reviewId) },
            { $inc: { dislikes: -1 } }
          );

          const updatedReview = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
          return res.json({ 
            message: 'Review undisliked',
            dislikes: updatedReview.dislikes,
            userDisliked: false
          });
        }

        // Remove any existing like
        const existingLike = await reviewLikesCollection.findOne({
          reviewId: new ObjectId(reviewId),
          userEmail: userEmail
        });

        if (existingLike) {
          await reviewLikesCollection.deleteOne({
            reviewId: new ObjectId(reviewId),
            userEmail: userEmail
          });
          await reviewsCollection.updateOne(
            { _id: new ObjectId(reviewId) },
            { $inc: { likes: -1 } }
          );
        }

        // Add new dislike
        await reviewDislikesCollection.insertOne({
          reviewId: new ObjectId(reviewId),
          userEmail: userEmail,
          createdAt: new Date()
        });

        // Update review dislikes count
        await reviewsCollection.updateOne(
          { _id: new ObjectId(reviewId) },
          { $inc: { dislikes: 1 } }
        );

        const updatedReview = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
        return res.json({ 
          message: 'Review disliked',
          dislikes: updatedReview.dislikes,
          userDisliked: true
        });

      } catch (error) {
        console.error('Error disliking review:', error);
        res.status(500).json({ message: 'Server error disliking review' });
      }
    });

    // Get review like/dislike status for a user
    app.get('/api/reviews/:reviewId/status', verifyFirebaseToken, async (req, res) => {
      try {
        const reviewId = req.params.reviewId;
        const userEmail = req.user.email;

        if (!ObjectId.isValid(reviewId)) {
          return res.status(400).json({ message: 'Invalid Review ID format' });
        }

        const [likeStatus, dislikeStatus] = await Promise.all([
          reviewLikesCollection.findOne({
            reviewId: new ObjectId(reviewId),
            userEmail: userEmail
          }),
          reviewDislikesCollection.findOne({
            reviewId: new ObjectId(reviewId),
            userEmail: userEmail
          })
        ]);

        res.json({
          userLiked: !!likeStatus,
          userDisliked: !!dislikeStatus
        });

      } catch (error) {
        console.error('Error getting review status:', error);
        res.status(500).json({ message: 'Server error getting review status' });
      }
    });

    // PATCH /api/reviews/:reviewId - Update a review (Protected)
    app.patch('/api/reviews/:reviewId', verifyFirebaseToken, async (req, res) => {
      try {
        const reviewId = req.params.reviewId;
        const userEmail = req.user.email;
        const { reviewText, rating } = req.body;

        if (!ObjectId.isValid(reviewId)) {
          return res.status(400).json({ message: 'Invalid Review ID format' });
        }

        const review = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
        if (!review) {
          return res.status(404).json({ message: 'Review not found' });
        }

        // Check if the authenticated user is the owner of the review
        if (review.userEmail !== userEmail) {
          return res.status(403).json({ message: 'Not authorized to update this review' });
        }

        const updateDoc = { $set: { updatedAt: new Date() } };
        if (reviewText !== undefined) updateDoc.$set.reviewText = reviewText;
        if (rating !== undefined) updateDoc.$set.rating = rating;

        if (Object.keys(updateDoc.$set).length === 1 && updateDoc.$set.updatedAt) {
           // Only updatedAt is present, no actual content change
           return res.status(200).json({ message: 'No changes detected for review update' });
        }

        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(reviewId), userEmail: userEmail },
          updateDoc
        );

        if (result.modifiedCount === 0) {
             // This might happen if no fields were actually different or review not found/owned
             const updatedReviewCheck = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
             if (!updatedReviewCheck || updatedReviewCheck.userEmail !== userEmail) {
                  return res.status(404).json({ message: 'Review not found or not authorized' });
             }
             // If review exists and is owned but modifiedCount is 0, it means data was the same
             return res.status(200).json({ message: 'Review data is the same, no update needed', review: updatedReviewCheck });
        }

        const updatedReview = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });

        // --- Recalculate average rating and total reviews for the book --- //
        const allReviewsForBook = await reviewsCollection.find({ bookId: review.bookId }).toArray();
        const totalReviews = allReviewsForBook.length;
        const averageRating = totalReviews > 0
          ? allReviewsForBook.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

        await booksCollection.updateOne(
          { _id: review.bookId },
          { $set: { rating: averageRating, totalReviews: totalReviews } }
        );
        // --- End recalculation --- //

        res.json({ message: 'Review updated successfully', review: updatedReview, averageRating: averageRating, totalReviews: totalReviews });

      } catch (error) {
        console.error('Update review error:', error);
        res.status(500).json({ message: 'Server error updating review' });
      }
    });

    // DELETE /api/reviews/:reviewId - Delete a review (Protected)
    app.delete('/api/reviews/:reviewId', verifyFirebaseToken, async (req, res) => {
      try {
        const reviewId = req.params.reviewId;
        const userEmail = req.user.email;

        if (!ObjectId.isValid(reviewId)) {
          return res.status(400).json({ message: 'Invalid Review ID format' });
        }

        const review = await reviewsCollection.findOne({ _id: new ObjectId(reviewId) });
        if (!review) {
          return res.status(404).json({ message: 'Review not found' });
        }

        // Check if the authenticated user is the owner of the review
        if (review.userEmail !== userEmail) {
          return res.status(403).json({ message: 'Not authorized to delete this review' });
        }

        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(reviewId), userEmail: userEmail });

        if (result.deletedCount === 0) {
          // This might happen if review not found or not owned (should be caught by auth check, but double-check)
          return res.status(404).json({ message: 'Review not found or not authorized for deletion' });
        }

        // --- Recalculate average rating and total reviews for the book --- //
        const allReviewsForBook = await reviewsCollection.find({ bookId: review.bookId }).toArray();
        const totalReviews = allReviewsForBook.length;
        const averageRating = totalReviews > 0
          ? allReviewsForBook.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

        await booksCollection.updateOne(
          { _id: review.bookId },
          { $set: { rating: averageRating, totalReviews: totalReviews } }
        );
        // --- End recalculation --- //

        res.json({ message: 'Review deleted successfully', averageRating: averageRating, totalReviews: totalReviews });

      } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({ message: 'Server error deleting review' });
      }
    });

    // Catch-all for undefined routes (should be after all other routes)
    app.use((req, res, next) => {
      res.status(404).json({ message: 'Endpoint not found' });
    });
  } finally {
  }
}
run().catch(console.error); // Log any errors during startup

app.get('/', (req, res) => {
  res.send('Virtual Bookshelf Backend Server is running!'); // Updated message
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke on the server!' });
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 