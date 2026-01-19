let years;
let user = prompt("Whats Your Name.", "");
let indegine = prompt("Are you an Indegine Of Nigeria ?.", "");
if (indegine.toLowerCase() == "yes") {
    years = prompt("how old are you", "");
    if (years >= 18) {
        alert("You can know proceed with your registration !");
    }
    else {
        alert("Sorry " + user +" you can register in the next " + Number(18 - years) + " Years !!" );
        document.body.innerHTML = "Sorry " + user + "<h1>YOU ARE UNDER AGE !</h1>"
    }
}
else {
    alert("Sorry " + user + " this is mainly for nigerian Indegine");
    document.body.innerHTML = "Sorry " + user + " <h1>YOU ARE NOT AN INDEGINE !.</h1>" ;
}