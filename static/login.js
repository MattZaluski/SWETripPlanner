const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("error")) {
    const msgElem = document.getElementById('message');

    msgElem.style.color = 'red';
    msgElem.textContent = urlParams.get("error") || 'Login failed. Please try again.';
}

// document.getElementById('login-form').addEventListener('submit', async function(e) {
//     e.preventDefault();

//     // Basic validation (add more as needed)
//     const email = this.email.value.trim();
//     const password = this.password.value;
//     const msgElem = document.getElementById('message');

//     if (!email || !password) {
//         msgElem.style.color = 'red';
//         msgElem.textContent = 'Email and password are required.';
//         return;
//     }

//     try {
        
//         const response = await fetch('/api/login-user', {
//             method: 'POST',
//             headers: { 
//                 'Content-Type': 'application/json',
//             },
//             credentials: "include", 
//             body: JSON.stringify({ email, password })
//         });
//         const result = await response.json();

//         if (response.ok) {
//             msgElem.style.color = 'green';
//             msgElem.textContent = 'Login successful! Redirecting...';

//             // Redirect after slight delay
//             setTimeout(() => {
//                 window.location.href = '/explore';
//             }, 500);
//         } else {
//             msgElem.style.color = 'red';
//             msgElem.textContent = result.error || 'Login failed. Please try again.';
//         }
//     } catch (err) {
//         msgElem.style.color = 'red';
//         msgElem.textContent = 'An error occurred. Please try again later.';
//         console.error('Login error:', err);
//     }
// });
