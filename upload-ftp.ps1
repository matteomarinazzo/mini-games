# Script FTP Upload
$ftpServer = "ftp://ftp.marinazzom.emf-informatique.ch"
$username = "marinazzom"
$password = "G!2@3=ks`$Yj8"
$localFile = "games/funfair/js/game.js"
$remoteFile = "/public_html/perso/mini-games-plateform/games/funfair/js/game.js"

# Create FTP request
$ftpUri = $ftpServer + $remoteFile
$ftpRequest = [System.Net.FtpWebRequest]::Create($ftpUri)
$ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
$ftpRequest.Credentials = New-Object System.Net.NetworkCredential($username, $password)
$ftpRequest.UseBinary = $true
$ftpRequest.UsePassive = $true

# Read file content
$fileContent = [System.IO.File]::ReadAllBytes($localFile)
$ftpRequest.ContentLength = $fileContent.Length

# Upload file
try {
    $requestStream = $ftpRequest.GetRequestStream()
    $requestStream.Write($fileContent, 0, $fileContent.Length)
    $requestStream.Close()
    
    $response = $ftpRequest.GetResponse()
    Write-Host "Upload successful: $($response.StatusDescription)" -ForegroundColor Green
    $response.Close()
} catch {
    Write-Host "Upload failed: $_" -ForegroundColor Red
}
