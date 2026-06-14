function global:git {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$UserArgs
    )

    $isBranchDelete = $false
    $targetBranch = $null

    if ($UserArgs.Count -ge 3 -and $UserArgs[0] -eq 'branch') {
        for ($i = 1; $i -lt $UserArgs.Count - 1; $i++) {
            $arg = $UserArgs[$i]
            if ($arg -eq '-d' -or $arg -eq '-D' -or $arg -eq '--delete') {
                $nextIdx = $i + 1
                if ($nextIdx -lt $UserArgs.Count -and $UserArgs[$nextIdx] -notlike '-*') {
                    $isBranchDelete = $true
                    $targetBranch = $UserArgs[$nextIdx]
                    break
                }
            }
        }
    }

    if ($isBranchDelete -and $targetBranch) {
        try {
            $configPath = Join-Path $env:USERPROFILE ".exeggutor.json"
            $port = 17492
            $token = ""
            if (Test-Path $configPath) {
                $config = Get-Content $configPath -Raw | ConvertFrom-Json
                if ($config.backendPort) { $port = $config.backendPort }
                if ($config.authToken) { $token = $config.authToken }
            }
            $response = Invoke-RestMethod -Uri "http://localhost:$port/api/branches/in-use?name=$targetBranch&token=$token" -ErrorAction Stop
            if ($response.inUse -eq $true) {
                Write-Error "Branch '$targetBranch' is in use by an active Exeggutor terminal. Switch the tab to another branch or close it first."
                return
            }
        }
        catch {
            Write-Error "Cannot verify branch status. Exeggutor backend must be running. Branch deletion blocked for safety."
            return
        }
    }

    & "git.exe" @UserArgs
}
