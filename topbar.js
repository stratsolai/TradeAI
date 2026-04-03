document.addEventListener("DOMContentLoaded", function() {
  var _ab = document.getElementById("account-btn");
  if (_ab) _ab.addEventListener("click", function(e) {
    e.stopPropagation();
    document.getElementById("account-dropdown").classList.toggle("open");
  });

  document.addEventListener("click", function() {
    document.getElementById("account-dropdown").classList.remove("open");
  });

  var _sb = document.getElementById("sign-out-btn");
  if (_sb) _sb.addEventListener("click", async function() {
    await supabaseClient.auth.signOut();
    window.location.href = "/login";
  });
});
