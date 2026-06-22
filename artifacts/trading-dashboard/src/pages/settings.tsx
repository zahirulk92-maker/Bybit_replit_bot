import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Key } from "lucide-react";

export default function Settings() {
  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        
        {/* API Connection */}
        <Card>
          <CardHeader className="border-b border-border p-4 bg-secondary/20">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-base flex items-center">
                  <Key className="w-4 h-4 mr-2" />
                  API Connection
                </CardTitle>
                <CardDescription>Bybit DEMO account credentials</CardDescription>
              </div>
              <div className="px-2 py-1 bg-green-500/10 border border-green-500/20 text-green-500 rounded text-xs font-bold tracking-wider">
                CONNECTED
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input id="api-key" type="password" value="************************" readOnly className="font-mono bg-secondary/50" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api-secret">API Secret</Label>
              <Input id="api-secret" type="password" value="****************************************" readOnly className="font-mono bg-secondary/50" />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" data-testid="button-test-conn">Test Connection</Button>
              <Button data-testid="button-save-api">Update Keys</Button>
            </div>
          </CardContent>
        </Card>

        {/* Risk Defaults */}
        <Card>
          <CardHeader className="border-b border-border p-4 bg-secondary/20">
            <CardTitle className="text-base">Risk Defaults</CardTitle>
            <CardDescription>Global risk management parameters</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Max Drawdown (%)</Label>
                <Input type="number" defaultValue="15" className="font-mono" />
              </div>
              <div className="grid gap-2">
                <Label>Daily Loss Limit ($)</Label>
                <Input type="number" defaultValue="5000" className="font-mono" />
              </div>
              <div className="grid gap-2">
                <Label>Max Open Positions</Label>
                <Input type="number" defaultValue="5" className="font-mono" />
              </div>
              <div className="grid gap-2">
                <Label>Max Leverage</Label>
                <Input type="number" defaultValue="10" className="font-mono" />
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-border mt-4">
              <Button data-testid="button-save-risk">
                <Save className="w-4 h-4 mr-2" />
                Save Risk Config
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader className="border-b border-border p-4 bg-secondary/20">
            <CardTitle className="text-base">System</CardTitle>
            <CardDescription>Bot operation and notification settings</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Restart on Error</Label>
                <p className="text-xs text-muted-foreground">Attempt to restart bot process if it crashes</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Telegram Notifications</Label>
                <p className="text-xs text-muted-foreground">Send trade alerts to configured Telegram chat</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Verbose Logging</Label>
                <p className="text-xs text-muted-foreground">Include DEBUG level entries in system logs</p>
              </div>
              <Switch />
            </div>
            <div className="flex justify-end pt-4 border-t border-border mt-4">
              <Button data-testid="button-save-system">
                <Save className="w-4 h-4 mr-2" />
                Save System Config
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
