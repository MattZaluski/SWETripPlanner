document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const data = {
        first_name: this.first_name.value.trim(),
        last_name: this.last_name.value.trim(),
        email: this.email.value.trim(),
        password: this.password.value
    };
    const response = await fetch('/api/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    const msgElem = document.getElementById('message');
    if (response.ok) {
        msgElem.style.color = 'green';
        msgElem.textContent = 'Registration successful! You can now log in.';
        window.location.href = '/login';
    } else {
        msgElem.style.color = 'red';
        msgElem.textContent = result.error || 'Registration failed. Please try again.';
    }
});