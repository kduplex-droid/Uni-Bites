// login.js
import { auth } from "./firebase.js";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";

// 1. Reference your HTML button
const googleButton = document.getElementById("google-login-btn");

// 2. Attach the login code to a click event
googleButton.addEventListener("click", () => {
  const provider = new GoogleAuthProvider();
  
  signInWithPopup(auth, provider)
    .then((result) => {
      console.log("Logged in successfully!", result.user);
      // Redirect your user to the dashboard or update the UI here
    })
    .catch((error) => {
      console.error("Sign-in failed:", error.message);
    });
});
