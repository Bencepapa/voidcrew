Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
function Await-Result($Async, $ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Async)); $task.Wait(); $task.Result
}
$file=Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Join-Path (Get-Location) 'out\editor-ui-design.pdf'))) ([Windows.Storage.StorageFile])
$pdf=Await-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
Write-Output "PDF pages: $($pdf.PageCount)"
for ($i=0; $i -lt $pdf.PageCount; $i++) {
 $page=$pdf.GetPage($i);$stream=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
 $action=$page.RenderToStreamAsync($stream)
 $actionMethod=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
 $task=$actionMethod.Invoke($null,@($action));$task.Wait()
 $net=[System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
 $target=Join-Path (Get-Location) ('out\qa\pdf-page-{0:00}.png' -f ($i+1))
 $output=[System.IO.File]::Create($target);$net.CopyTo($output);$output.Dispose();$net.Dispose();$page.Dispose()
}
[Environment]::Exit(0)
