const firebaseConfig = {
  apiKey: "AIzaSyC6-dCw805TfQqY16F23FHv-G-WIk5FLME",
  authDomain: "job-74226-25741.firebaseapp.com",
  databaseURL: "https://job-74226-25741-default-rtdb.firebaseio.com",
  projectId: "job-74226-25741",
  storageBucket: "job-74226-25741.appspot.com",
  messagingSenderId: "974226488579",
  appId: "1:974226488579:web:96739d86788da067b57d36"
};

// ✅ Initialize Firebase
firebase.initializeApp(firebaseConfig);

// ✅ Create global handles for your app
const auth = firebase.auth();
const db = firebase.database();

console.log("✅ Firebase initialized successfully");
